import copy
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from validate import GovernanceError, validate


class GovernanceTests(unittest.TestCase):
    def setUp(self):
        self.record = json.loads((ROOT / 'examples/accepted.json').read_text())

    def rejected(self):
        with self.assertRaises(GovernanceError):
            validate(self.record)

    def test_complete_flow(self):
        self.assertEqual(validate(self.record), 'accepted')

    def test_cannot_skip_business_review(self):
        del self.record['events'][2]
        self.rejected()

    def test_cannot_test_before_developer_approval(self):
        del self.record['events'][3]
        self.rejected()

    def test_agent_cannot_approve(self):
        for index in (0, 3, 5):
            with self.subTest(index=index):
                original = self.record['events'][index]['actor']
                self.record['events'][index]['actor'] = 'architect'
                self.rejected()
                self.record['events'][index]['actor'] = original

    def test_unknown_semantics_block(self):
        self.record['contracts'][0]['requirements'][0]['kind'] = 'unknown'
        self.rejected()

    def test_existing_behavior_needs_preservation(self):
        del self.record['contracts'][0]['requirements'][1]['preservation_decision']
        self.rejected()

    def test_delegation_requires_bounds(self):
        self.record['contracts'][0]['requirements'][0]['kind'] = 'delegated'
        self.rejected()

    def test_stale_candidate_at_each_gate(self):
        for index in (2, 3, 4, 5):
            with self.subTest(index=index):
                self.record['events'][index]['candidate'] = 'stale'
                self.rejected()
                self.record['events'][index]['candidate'] = 'production-B'

    def test_findings_need_dispositions(self):
        self.record['events'][3]['dispositions'] = {}
        self.rejected()

    def test_failure_not_accepted(self):
        self.record['events'][4]['status'] = 'fail'
        self.rejected()

    def test_missing_coverage_requires_gap_decision(self):
        self.record['events'][4]['covered'].pop()
        self.rejected()

    def test_explicit_gap_is_recorded(self):
        self.record['events'][4]['covered'].pop()
        self.record['events'][4]['gaps'] = {'R3': {'reason':'Unavailable environment', 'impact':'Retry behavior not independently executed', 'revisit':'Environment restored', 'developer_decision':'gap-D1'}}
        self.assertEqual(validate(self.record), 'accepted')

    def test_acceptance_requires_code_review(self):
        del self.record['events'][5]['code_review']
        self.rejected()

    def test_acceptance_bound_to_delivery(self):
        self.record['events'][5]['delivery'] = 'different-tests'
        self.rejected()

    def test_revision_invalidates_testing_permission(self):
        self.record['events'].insert(4, {'type':'revise', 'actor':'architect', 'reason':'Business semantics changed'})
        self.rejected()

    def test_code_fix_repeats_downstream_gates(self):
        first = copy.deepcopy(self.record['events'][:4])
        second = copy.deepcopy(self.record['events'])
        second[0]['decision'] = 'D4'
        second[3]['decision'] = 'D5'
        for event in second:
            if 'candidate' in event:
                event['candidate'] = 'production-C'
        self.record['events'] = first + [{'type':'revise','actor':'architect','reason':'Production defect'}] + second
        self.assertEqual(validate(self.record), 'accepted')

    def test_reused_candidate_rejected_after_revision(self):
        first = copy.deepcopy(self.record['events'][:4])
        self.record['events'][0]['decision'] = 'new-D1'
        self.record['events'] = first + [{'type':'revise','actor':'architect','reason':'Changed code'}] + self.record['events']
        self.rejected()

    def test_block_resume_requires_reapproval(self):
        self.record['events'] = self.record['events'][:1] + [
            {'type':'block','actor':'scout','reason':'Missing evidence','owner':'developer','next_action':'Supply snapshot'},
            {'type':'resume','actor':'architect','reason':'Snapshot supplied'},
        ]
        self.assertEqual(validate(self.record), 'dialogue')
        self.record['events'].append({'type':'submit_implementation','actor':'implementer','revision':2,'candidate':'new','outcomes':['R1','R2','R3'],'evidence':'report'})
        self.rejected()

    def test_terminal_history_cannot_continue(self):
        self.record['events'].append({'type':'revise','actor':'developer','reason':'New feature'})
        self.rejected()

    def test_malformed_records_fail_closed(self):
        for record in (None, [], {}, {'schema_version':True}, {'schema_version':1,'change_id':'x','contracts':[None]}):
            with self.subTest(record=record), self.assertRaises(GovernanceError):
                validate(record)

    def test_unknown_event_rejected(self):
        self.record['events'][0]['type'] = 'auto_approve'
        self.rejected()

    def test_superseded_contract_cannot_return(self):
        older = copy.deepcopy(self.record['contracts'][0])
        older['revision'] = 1
        self.record['contracts'].append(older)
        self.record['events'] = self.record['events'][:1] + [
            {'type':'revise','actor':'architect','reason':'Reconsider'},
            {'type':'approve_contract','actor':'developer','revision':1,'decision':'D4','source':'dialogue:4'}]
        self.rejected()


if __name__ == '__main__':
    unittest.main()
