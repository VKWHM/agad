"""Reference record validator; no agent execution or human authentication."""
import json
import sys
from pathlib import Path


class GovernanceError(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise GovernanceError(message)


def text(value):
    return isinstance(value, str) and bool(value.strip())


def string_list(value):
    return isinstance(value, list) and all(text(x) for x in value) and len(value) == len(set(value))


def validate(record):
    require(isinstance(record, dict), 'Record must be an object')
    require(type(record.get('schema_version')) is int and record['schema_version'] == 1, 'Unsupported schema version')
    require(text(record.get('change_id')), 'Missing change ID')
    contracts = record.get('contracts')
    require(isinstance(contracts, list) and contracts, 'Contracts must be a nonempty list')
    versions = {}
    for contract in contracts:
        require(isinstance(contract, dict), 'Contract must be an object')
        revision = contract.get('revision')
        require(type(revision) is int and revision > 0 and revision not in versions, 'Invalid or duplicate revision')
        requirements = contract.get('requirements')
        require(isinstance(requirements, list) and requirements, 'Requirements must be a nonempty list')
        ids = set()
        for item in requirements:
            require(isinstance(item, dict), 'Requirement must be an object')
            rid = item.get('id')
            require(text(rid) and rid not in ids, 'Missing or duplicate requirement ID')
            ids.add(rid)
            require(text(item.get('statement')) and text(item.get('source')), 'Requirement needs statement and provenance')
            require(type(item.get('in_scope')) is bool, 'Requirement needs explicit scope')
            require(item.get('kind') in ('confirmed', 'existing', 'delegated', 'unknown'), 'Invalid knowledge state')
        versions[revision] = requirements
    events = record.get('events')
    require(isinstance(events, list), 'Events must be a list')
    state, current, candidate, delivery, report = 'dialogue', None, None, None, None
    findings, seen_candidates, decisions = set(), set(), set()
    maximum_revision = 0
    active_requirements = set()
    transitions = {
        'approve_contract': ('dialogue', 'developer', 'authorized'),
        'submit_implementation': ('authorized', 'implementer', 'implemented'),
        'submit_business_review': ('implemented', 'business_reviewer', 'reviewed'),
        'provisionally_approve': ('reviewed', 'developer', 'test_authorized'),
        'submit_tests': ('test_authorized', 'test_engineer', 'tested'),
        'accept': ('tested', 'developer', 'accepted'),
    }
    roles = {'developer', 'architect', 'scout', 'implementer', 'business_reviewer', 'test_engineer'}
    for index, event in enumerate(events):
        require(isinstance(event, dict), f'Event {index} must be an object')
        kind, actor = event.get('type'), event.get('actor')
        require(state not in ('accepted', 'cancelled'), 'Terminal run cannot be changed')
        require(actor in roles, 'Unknown actor role')
        if kind in ('revise', 'block', 'resume', 'cancel'):
            require(text(event.get('reason')), 'Control event needs reason')
            require(kind != 'resume' or state == 'blocked', 'Resume requires blocked state')
            require(kind != 'revise' or state != 'blocked', 'Blocked run must resume first')
            if kind in ('revise', 'resume'):
                require(actor in ('developer', 'architect'), 'Only Developer or Architect may restart dialogue')
                state = 'dialogue'
            elif kind == 'cancel':
                require(actor == 'developer', 'Only Developer may cancel')
                state = 'cancelled'
            else:
                require(state != 'blocked', 'Already blocked')
                require(text(event.get('owner')) and text(event.get('next_action')), 'Block needs owner and next action')
                state = 'blocked'
            candidate = delivery = report = None
            findings = set()
            continue
        require(kind in transitions, 'Unknown event type')
        before, expected_actor, after = transitions[kind]
        require(state == before, f'{kind} requires {before}, found {state}')
        require(actor == expected_actor, f'{kind} requires {expected_actor}')
        revision = event.get('revision')
        require(type(revision) is int and revision in versions, 'Event references missing contract')
        if actor == 'developer':
            decision = event.get('decision')
            require(text(decision) and decision not in decisions and text(event.get('source')), 'Explicit unique developer decision/source required')
            decisions.add(decision)
        if kind == 'approve_contract':
            require(revision >= maximum_revision, 'Cannot restore a superseded contract')
            maximum_revision = revision
            current = revision
            active_requirements = {r['id'] for r in versions[current] if r['in_scope']}
            require(active_requirements, 'Contract has no in-scope outcomes')
            for item in versions[current]:
                if not item['in_scope']:
                    require(text(item.get('exclusion_decision')) and text(item.get('exclusion_reason')) and text(item.get('revisit')), 'Excluded requirement needs decision, reason and revisit trigger')
                    continue
                require(item['kind'] != 'unknown', 'In-scope unknown blocks implementation')
                if item['kind'] == 'existing':
                    require(text(item.get('preservation_decision')), 'Existing behavior needs preservation approval')
                if item['kind'] == 'delegated':
                    require(all(text(item.get(key)) for key in ('owner', 'bounds', 'escalation')), 'Delegation needs owner, bounds and escalation')
        else:
            require(revision == current, 'Stale contract revision')
            if kind == 'submit_implementation':
                value = event.get('candidate')
                require(text(value) and value not in seen_candidates, 'Implementation needs fresh immutable candidate')
                seen_candidates.add(value)
                candidate = value
                require(string_list(event.get('outcomes')) and set(event['outcomes']) == active_requirements, 'Implementation must map approved outcomes')
            else:
                require(event.get('candidate') == candidate, 'Stale or missing candidate')
        if kind in ('submit_implementation', 'submit_business_review', 'submit_tests'):
            require(text(event.get('evidence')), 'Role report needs evidence')
        if kind == 'submit_business_review':
            require(string_list(event.get('findings')), 'Review findings must have unique IDs')
            findings = set(event['findings'])
        if kind == 'provisionally_approve':
            require(event.get('presented_by') == 'architect', 'Architect must present findings to Developer')
            dispositions = event.get('dispositions')
            require(isinstance(dispositions, dict) and set(dispositions) == findings, 'Every finding needs a developer disposition')
            for disposition in dispositions.values():
                require(isinstance(disposition, dict), 'Disposition must be an object')
                require(disposition.get('action') in ('resolved', 'excluded', 'accepted_risk'), 'Unresolved finding blocks testing')
                require(text(disposition.get('reason')), 'Disposition needs rationale')
                if disposition['action'] != 'resolved':
                    require(text(disposition.get('revisit')), 'Risk or exclusion needs revisit trigger')
        if kind == 'submit_tests':
            require(event.get('status') == 'pass', 'Failed/blocked tests must return to dialogue or block')
            require(string_list(event.get('covered')) and set(event['covered']) <= active_requirements, 'Invalid coverage IDs')
            gaps = event.get('gaps', {})
            require(isinstance(gaps, dict) and set(gaps) == active_requirements - set(event['covered']), 'Every untested outcome needs an explicit gap')
            for gap in gaps.values():
                require(isinstance(gap, dict) and all(text(gap.get(k)) for k in ('reason', 'impact', 'revisit', 'developer_decision')), 'Test gap needs developer decision, reason, impact and revisit')
            delivery, report = event.get('delivery'), event.get('report')
            require(text(delivery) and text(report), 'Tests need exact delivery and report IDs')
        if kind == 'accept':
            require(event.get('delivery') == delivery and event.get('report') == report, 'Acceptance needs current tested delivery/report')
            require(text(event.get('code_review')), 'Human code review required')
        state = after
    return state


def main():
    if len(sys.argv) != 2:
        print('Usage: python3 tools/validate.py RECORD.json', file=sys.stderr)
        return 2
    try:
        state = validate(json.loads(Path(sys.argv[1]).read_text()))
    except (GovernanceError, OSError, ValueError) as exc:
        print(f'INVALID: {exc}', file=sys.stderr)
        return 1
    print(f'VALID record; state={state} (consistency only, not authenticated approval)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
