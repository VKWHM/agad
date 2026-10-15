"""Replay abstract AGAD records. Does not run agents or authenticate humans."""
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


def strings(value):
    return isinstance(value, list) and all(text(x) for x in value) and len(value) == len(set(value))


def fields(value, keys):
    return isinstance(value, dict) and all(text(value.get(k)) for k in keys)


ROLES = {'developer', 'architect', 'scout', 'implementer', 'business_reviewer', 'test_engineer'}


def validate(record):
    require(isinstance(record, dict), 'Record must be an object')
    require(type(record.get('schema_version')) is int and record['schema_version'] == 2, 'Unsupported schema version; expected 2')
    require(text(record.get('change_id')), 'Missing change ID')
    contracts = record.get('contracts')
    require(isinstance(contracts, list) and contracts, 'Contracts must be a nonempty list')
    versions = {}
    for contract in contracts:
        require(isinstance(contract, dict), 'Contract must be an object')
        revision = contract.get('revision')
        require(type(revision) is int and revision > 0 and revision not in versions, 'Invalid or duplicate revision')
        require(fields(contract, ('intent', 'rationale')), 'Contract needs intent and decision rationale')
        require(contract.get('risk') in ('trivial', 'routine', 'standard', 'critical'), 'Missing risk assessment')
        require(contract.get('change_type') in ('technical', 'business'), 'Missing change type')
        vocabulary = contract.get('vocabulary')
        require(isinstance(vocabulary, dict) and vocabulary and all(text(k) and text(v) for k, v in vocabulary.items()), 'Contract needs shared vocabulary')
        require(strings(contract.get('architecture')) and contract['architecture'], 'Contract needs architecture boundaries')
        requirements = contract.get('requirements')
        require(isinstance(requirements, list) and requirements, 'Requirements must be a nonempty list')
        ids = set()
        for item in requirements:
            require(isinstance(item, dict), 'Requirement must be an object')
            rid = item.get('id')
            require(text(rid) and rid not in ids, 'Missing or duplicate requirement ID')
            ids.add(rid)
            require(fields(item, ('statement', 'source')), 'Requirement needs statement and provenance')
            require(type(item.get('in_scope')) is bool, 'Requirement needs explicit scope')
            require(item.get('kind') in ('confirmed', 'existing', 'delegated', 'unknown'), 'Invalid knowledge state')
        require(strings(contract.get('invariant_ids')) and set(contract['invariant_ids']) <= ids, 'Invalid invariant references')
        require(strings(contract.get('required_checks')), 'Contract needs explicit required checks (may be empty if justified in rationale)')
        versions[revision] = contract
    events = record.get('events')
    require(isinstance(events, list), 'Events must be a list')
    state, current, candidate, delivery, report = 'dialogue', None, None, None, None
    findings, gap_approvals = {}, {}
    candidates, decisions, seen_deliveries, seen_reports = set(), set(), set(), set()
    maximum_revision = 0
    active, invariants, checks = set(), set(), set()
    transitions = {
        'approve_contract': ('dialogue', 'developer', 'authorized'),
        'submit_implementation': ('authorized', 'implementer', 'implemented'),
        'submit_business_review': ('implemented', 'business_reviewer', 'reviewed'),
        'waive_business_review': ('implemented', 'developer', 'reviewed'),
        'provisionally_approve': ('reviewed', 'developer', 'test_authorized'),
        'approve_test_gap': ('test_authorized', 'developer', 'test_authorized'),
        'submit_tests': ('test_authorized', 'test_engineer', 'tested'),
        'accept': ('tested', 'developer', 'accepted'),
    }
    for index, event in enumerate(events):
        require(isinstance(event, dict), f'Event {index} must be an object')
        kind, actor = event.get('type'), event.get('actor')
        require(text(kind) and text(actor) and actor in ROLES, 'Unknown event/actor role')
        require(state not in ('accepted', 'cancelled'), 'Terminal run cannot be changed')
        # A role label is a declaration, not authentication. The runtime must verify source.
        if actor == 'developer':
            decision = event.get('decision')
            require(text(decision) and decision not in decisions and text(event.get('source')), 'Explicit unique developer decision/source required')
            decisions.add(decision)
        if kind in ('revise', 'block', 'resume', 'cancel', 'request_repair', 'request_test_correction'):
            require(text(event.get('reason')), 'Control event needs reason')
            if kind == 'request_test_correction':
                require(actor == 'architect' and state in ('tested', 'test_failed', 'test_authorized'), 'Test correction requires Architect and prior testing approval')
                require(type(event.get('revision')) is int and event['revision'] == current and event.get('candidate') == candidate, 'Test correction must bind current contract/candidate')
                require(event.get('changes_business_semantics') is False, 'New expected behavior requires dialogue')
                require(strings(event.get('outcomes')) and event['outcomes'] and set(event['outcomes']) <= active and text(event.get('evidence')), 'Test correction needs evidence linked to approved outcomes')
                delivery = report = None
                state = 'test_authorized'
                continue
            if kind == 'request_repair':
                require(actor == 'architect' and state in ('implemented', 'reviewed', 'test_authorized', 'tested', 'test_failed'), 'Repair requires Architect and an existing candidate')
                require(type(event.get('revision')) is int and event['revision'] == current and event.get('candidate') == candidate, 'Repair must bind current contract/candidate')
                require(event.get('changes_business_semantics') is False, 'Business changes require dialogue and a new contract revision')
                require(strings(event.get('outcomes')) and event['outcomes'] and set(event['outcomes']) <= active and text(event.get('evidence')), 'Repair needs defect evidence linked to approved outcomes')
                state = 'authorized'
            elif kind in ('revise', 'resume'):
                require(actor in ('developer', 'architect'), 'Only Developer or Architect may restart dialogue')
                require((kind == 'resume') == (state == 'blocked'), 'Blocked run requires resume; resume requires blocked state')
                state = 'dialogue'
            elif kind == 'cancel':
                require(actor == 'developer', 'Only Developer may cancel')
                state = 'cancelled'
            else:
                require(state != 'blocked' and fields(event, ('owner', 'next_action')), 'Block needs owner/next action and an active run')
                state = 'blocked'
            candidate = delivery = report = None
            findings, gap_approvals = {}, {}
            continue
        if kind == 'plan_tests':
            require(actor == 'test_engineer' and state in ('authorized', 'implemented', 'reviewed', 'test_authorized'), 'Planning requires approved contract')
            require(type(event.get('revision')) is int and event['revision'] == current and event.get('artifact_kind') == 'scenario_plan', 'Early planning cannot write or execute tests')
            require(strings(event.get('outcomes')) and event['outcomes'] and set(event['outcomes']) <= active and text(event.get('evidence')), 'Plan needs approved outcome references and evidence')
            continue
        require(kind in transitions, 'Unknown event type')
        before, expected_actor, after = transitions[kind]
        require(state == before, f'{kind} requires {before}, found {state}')
        require(actor == expected_actor, f'{kind} requires {expected_actor}')
        revision = event.get('revision')
        require(type(revision) is int and revision in versions, 'Event references missing contract')
        if kind == 'approve_contract':
            require(revision >= maximum_revision, 'Cannot restore a superseded contract')
            require(event.get('presented_by') == 'architect' and text(event.get('teach_back')), 'Architect teach-back required before contract approval')
            maximum_revision = current = revision
            contract = versions[current]
            active = {r['id'] for r in contract['requirements'] if r['in_scope']}
            invariants, checks = set(contract['invariant_ids']), set(contract['required_checks'])
            require(active and invariants <= active, 'Contract needs in-scope outcomes and cannot exclude an invariant')
            for item in contract['requirements']:
                if not item['in_scope']:
                    require(item.get('exclusion_decision') == event['decision'] and fields(item, ('exclusion_reason', 'revisit')), 'Exclusion needs current developer approval, reason and revisit trigger')
                    continue
                require(item['kind'] != 'unknown', 'In-scope unknown blocks implementation')
                if item['kind'] == 'delegated':
                    require(fields(item, ('owner', 'bounds', 'escalation')) and item['owner'] in ROLES - {'developer', 'scout', 'business_reviewer'}, 'Delegation needs permitted owner, bounds and escalation')
        else:
            require(revision == current, 'Stale contract revision')
            if kind == 'submit_implementation':
                value = event.get('candidate')
                require(text(value) and value not in candidates, 'Implementation needs fresh immutable candidate')
                candidates.add(value)
                candidate = value
                require(strings(event.get('outcomes')) and set(event['outcomes']) == active, 'Implementation must map approved outcomes')
                delegated = {r['id']: r for r in versions[current]['requirements'] if r['in_scope'] and r['kind'] == 'delegated'}
                choices = event.get('delegated_choices', {})
                require(isinstance(choices, dict) and set(choices) == set(delegated), 'Delegated choices must be documented')
                for rid, choice in choices.items():
                    require(fields(choice, ('owner', 'choice', 'rationale')) and choice['owner'] == delegated[rid]['owner'], 'Delegated choice needs authorized owner and rationale')
            else:
                require(event.get('candidate') == candidate, 'Stale or missing candidate')
        if kind in ('submit_implementation', 'submit_business_review', 'submit_tests'):
            require(text(event.get('evidence')), 'Role report needs evidence')
        if kind == 'submit_business_review':
            require(event.get('alignment') in ('aligned', 'misaligned', 'uncertain'), 'Review needs alignment status')
            require(event.get('review_order') == 'scenarios_then_implementation' and text(event.get('scenario_basis')), 'Review must derive scenarios from approved intent first')
            items = event.get('findings')
            require(isinstance(items, list), 'Review findings must be structured')
            findings = {}
            for item in items:
                require(fields(item, ('id', 'scenario', 'evidence', 'impact', 'question')), 'Finding needs scenario, evidence, business impact and question')
                require(item['id'] not in findings and item.get('classification') in ('violation', 'new_scenario', 'ambiguity', 'risk'), 'Duplicate or unclassified finding')
                require(strings(item.get('requirements')) and set(item['requirements']) <= active, 'Finding has invalid requirement references')
                require(item['classification'] != 'violation' or item['requirements'], 'Violation must identify an approved requirement')
                findings[item['id']] = item
            require(event['alignment'] == 'aligned' or findings, 'Misalignment or uncertainty needs explicit findings')
        if kind == 'waive_business_review':
            contract = versions[current]
            require(contract['risk'] == 'trivial' and contract['change_type'] == 'technical', 'Only trivial technical changes may waive review')
            require(event.get('presented_by') == 'architect' and text(event.get('reason')), 'Developer waiver requires Architect rationale')
            require(event.get('no_business_change') is True and event.get('no_architecture_change') is True, 'Waiver cannot change business meaning or architecture')
            findings = {}
        if kind == 'provisionally_approve':
            require(event.get('presented_by') == 'architect', 'Architect must present findings to Developer')
            dispositions = event.get('dispositions')
            require(isinstance(dispositions, dict) and set(dispositions) == set(findings), 'Every finding needs a developer disposition')
            for fid, disposition in dispositions.items():
                require(fields(disposition, ('reason',)) and disposition.get('action') in ('resolved', 'excluded', 'accepted_risk'), 'Unresolved finding blocks testing')
                if disposition['action'] == 'resolved':
                    require(text(disposition.get('evidence')), 'Resolution needs evidence; code changes require a fresh candidate')
                else:
                    require(findings[fid]['classification'] != 'violation', 'Cannot waive an approved requirement violation; repair or amend contract')
                    require(text(disposition.get('revisit')), 'Risk or exclusion needs revisit trigger')
        if kind == 'approve_test_gap':
            outcomes = event.get('outcomes')
            require(strings(outcomes) and outcomes and set(outcomes) <= active - invariants, 'Test gap cannot waive an invariant or unknown outcome')
            require(fields(event, ('reason', 'impact', 'revisit')), 'Test gap needs reason, impact and revisit trigger')
            for rid in outcomes:
                gap_approvals[rid] = event['decision']
        if kind == 'submit_tests':
            status = event.get('status')
            require(status in ('pass', 'fail', 'blocked'), 'Invalid test status')
            require(strings(event.get('covered')) and set(event['covered']) <= active, 'Invalid coverage IDs')
            results = event.get('checks')
            require(isinstance(results, list), 'Test report needs actual check results')
            result_ids = set()
            for result in results:
                require(fields(result, ('id', 'evidence')) and result['id'] in checks and result['id'] not in result_ids and result.get('status') in ('pass', 'fail', 'blocked'), 'Invalid, duplicate or unevidenced check result')
                result_ids.add(result['id'])
            delivery, report = event.get('delivery'), event.get('report')
            require(text(delivery) and text(report) and delivery not in seen_deliveries and report not in seen_reports, 'Tests need fresh delivery and report IDs')
            seen_deliveries.add(delivery)
            seen_reports.add(report)
            if status == 'pass':
                require(result_ids == checks and all(x['status'] == 'pass' for x in results), 'PASS requires every mandatory check to pass')
                covered = set(event['covered'])
                require(invariants <= covered, 'Invariant verification cannot be waived')
                gaps = event.get('gaps', {})
                require(isinstance(gaps, dict) and set(gaps) == active - covered, 'Every untested outcome needs a gap')
                for rid, gap in gaps.items():
                    require(isinstance(gap, dict) and rid in gap_approvals and gap.get('developer_decision') == gap_approvals[rid], 'Test gap needs prior scoped developer approval')
            elif status == 'fail':
                require(text(event.get('reason')) and any(x['status'] == 'fail' for x in results), 'Failure needs actual failing check and reason')
                after = 'test_failed'
            else:
                require(fields(event, ('reason', 'owner', 'next_action')), 'Blocked tests need reason, owner and next action')
                after = 'blocked'
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
