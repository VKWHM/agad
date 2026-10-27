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

    def test_architecture_precedent_evidence(self):
        self.assertEqual(validate(self.record), 'accepted')
        self.record['contracts'][0]['architecture_precedent']['source'] = ''
        self.rejected()
        self.record['contracts'][0]['architecture_precedent'] = {'status': 'deviated', 'source': 'repo:example', 'rationale': ''}
        self.rejected()
        self.record['contracts'][0]['architecture_precedent'] = {'status': 'none', 'rationale': 'No comparable implementation found'}
        self.assertEqual(validate(self.record), 'accepted')
        del self.record['contracts'][0]['architecture_precedent']
        self.assertEqual(validate(self.record), 'accepted')

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

    def test_existing_behavior_preserved_without_extra_approval(self):
        self.assertNotIn('preservation_decision', self.record['contracts'][0]['requirements'][1])
        self.assertEqual(validate(self.record), 'accepted')

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
        self.record['events'][4]['covered'].remove('R2')
        self.record['events'][4]['gaps'] = {'R2': {'developer_decision':'gap-D1'}}
        self.record['events'].insert(4, {'type':'approve_test_gap','actor':'developer','revision':2,'candidate':'production-B','outcomes':['R2'],'reason':'Unavailable fixture','impact':'Legacy rejection not independently tested','revisit':'Fixture restored','decision':'gap-D1','source':'dialogue:gap'})
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

    def plan(self):
        return {'type':'plan_tests','actor':'test_engineer','revision':2,'artifact_kind':'scenario_plan','outcomes':['R1','R3'],'evidence':'plan:contract-2'}

    def waiver(self):
        return {'type':'waive_business_review','actor':'developer','revision':2,'candidate':'production-B','decision':'waiver-D1','source':'dialogue:waiver','presented_by':'architect','reason':'Trivial technical-only change','no_business_change':True,'no_architecture_change':True}

    def repair(self):
        return {'type':'request_repair','actor':'architect','revision':2,'candidate':'production-B','reason':'Confirmed defect under existing invariant','changes_business_semantics':False,'outcomes':['R1'],'evidence':'reproduction:1'}

    def test_early_planning_allowed_after_contract_approval(self):
        self.record['events'].insert(1, self.plan())
        self.assertEqual(validate(self.record), 'accepted')

    def test_planning_before_approval_rejected(self):
        self.record['events'].insert(0, self.plan())
        self.rejected()

    def test_early_planning_cannot_write_tests(self):
        event = self.plan()
        event['artifact_kind'] = 'test_code'
        self.record['events'].insert(1, event)
        self.rejected()

    def test_early_planning_cannot_introduce_unknown_outcomes(self):
        event = self.plan()
        event['outcomes'] = ['new-business-rule']
        self.record['events'].insert(1, event)
        self.rejected()

    def test_trivial_waiver_requires_developer_and_provisional_approval(self):
        self.record['contracts'][0].update(risk='trivial',change_type='technical')
        self.record['events'][2] = self.waiver()
        self.record['events'][3]['dispositions'] = {}
        self.assertEqual(validate(self.record), 'accepted')
        del self.record['events'][3]
        self.rejected()

    def test_architect_cannot_waive_review(self):
        event = self.waiver()
        event['actor'] = 'architect'
        self.record['events'][2] = event
        self.rejected()

    def test_nontrivial_review_cannot_be_waived(self):
        for risk, change_type in [('critical','technical'), ('standard','technical'), ('trivial','business')]:
            with self.subTest(risk=risk, change_type=change_type):
                self.record['contracts'][0].update(risk=risk,change_type=change_type)
                self.record['events'][2] = self.waiver()
                self.rejected()

    def test_waiver_cannot_change_architecture(self):
        self.record['contracts'][0].update(risk='trivial',change_type='technical')
        event = self.waiver()
        event['no_architecture_change'] = False
        self.record['events'][2] = event
        self.rejected()

    def test_waiver_is_bound_to_current_candidate(self):
        self.record['contracts'][0].update(risk='trivial',change_type='technical')
        event = self.waiver()
        event['candidate'] = 'stale'
        self.record['events'][2] = event
        self.rejected()

    def test_technical_repair_does_not_repeat_contract_approval(self):
        first = copy.deepcopy(self.record['events'][:4])
        second = copy.deepcopy(self.record['events'][1:])
        second[2]['decision'] = 'D4'
        for event in second:
            if 'candidate' in event:
                event['candidate'] = 'production-C'
        self.record['events'] = first + [self.repair()] + second
        self.assertEqual(validate(self.record), 'accepted')

    def test_business_change_cannot_use_technical_repair(self):
        event = self.repair()
        event['changes_business_semantics'] = True
        self.record['events'] = self.record['events'][:4] + [event]
        self.rejected()

    def test_technical_repair_cannot_skip_business_review(self):
        self.record['events'] = self.record['events'][:4] + [self.repair(), copy.deepcopy(self.record['events'][4])]
        self.rejected()

    def test_findings_need_business_evidence(self):
        del self.record['events'][2]['findings'][0]['impact']
        self.rejected()

    def test_ids_only_review_rejected(self):
        self.record['events'][2]['findings'] = ['F1']
        self.rejected()

    def test_requirement_violation_cannot_be_accepted_as_risk(self):
        self.record['events'][2]['findings'][0].update(classification='violation', requirements=['R1'])
        self.record['events'][3]['dispositions']['F1']['action'] = 'accepted_risk'
        self.rejected()

    def test_requirement_violation_cannot_be_excluded(self):
        self.record['events'][2]['findings'][0].update(classification='violation', requirements=['R1'])
        self.rejected()

    def test_false_positive_finding_needs_resolution_evidence(self):
        self.record['events'][3]['dispositions']['F1'] = {'action':'resolved','reason':'Already handled'}
        self.rejected()
        self.record['events'][3]['dispositions']['F1']['evidence'] = 'reproduction:already-handled'
        self.assertEqual(validate(self.record), 'accepted')

    def test_invariant_test_gap_cannot_be_approved(self):
        self.record['events'].insert(4, {'type':'approve_test_gap','actor':'developer','revision':2,'candidate':'production-B','outcomes':['R3'],'reason':'Unavailable fixture','impact':'Invariant untested','revisit':'Later','decision':'gap-D1','source':'dialogue:gap'})
        self.rejected()

    def test_fabricated_gap_reference_rejected(self):
        self.record['events'][4]['covered'].remove('R2')
        self.record['events'][4]['gaps'] = {'R2': {'developer_decision':'made-up'}}
        self.rejected()

    def test_stale_gap_approval_rejected(self):
        self.record['events'].insert(4, {'type':'approve_test_gap','actor':'developer','revision':2,'candidate':'stale','outcomes':['R2'],'reason':'Fixture','impact':'Legacy behavior','revisit':'Later','decision':'gap-D1','source':'dialogue:gap'})
        self.rejected()

    def test_pass_cannot_hide_a_failed_check(self):
        self.record['events'][4]['checks'][0]['status'] = 'fail'
        self.rejected()

    def test_pass_cannot_omit_mandatory_check(self):
        self.record['events'][4]['checks'] = []
        self.rejected()

    def test_failed_report_is_recorded_but_cannot_be_accepted(self):
        self.record['events'][4].update(status='fail',reason='Draft transition violates R1')
        self.record['events'][4]['checks'][0]['status'] = 'fail'
        final = self.record['events'].pop()
        self.assertEqual(validate(self.record), 'test_failed')
        self.record['events'].append(final)
        self.rejected()

    def test_blocked_test_report_records_next_action(self):
        self.record['events'] = self.record['events'][:5]
        self.record['events'][4].update(status='blocked',reason='Environment unavailable',owner='developer',next_action='Restore environment')
        self.record['events'][4]['checks'][0]['status'] = 'blocked'
        self.assertEqual(validate(self.record), 'blocked')

    def test_teach_back_required(self):
        del self.record['events'][0]['teach_back']
        self.rejected()

    def test_independent_scenario_derivation_required(self):
        self.record['events'][2]['review_order'] = 'implementation_only'
        self.rejected()

    def test_delegated_choice_needs_rationale(self):
        item = self.record['contracts'][0]['requirements'][0]
        item.update(kind='delegated', owner='implementer', bounds='Existing utility only', escalation='Needs new dependency')
        self.rejected()
        self.record['events'][1]['delegated_choices'] = {'R1':{'owner':'implementer','choice':'Existing utility','rationale':'Preserves current boundary'}}
        self.assertEqual(validate(self.record), 'accepted')

    def test_missing_human_statement_rejected(self):
        del self.record['events'][3]['source']
        self.rejected()

    def test_cannot_reuse_human_decision_at_another_checkpoint(self):
        self.record['events'][3]['decision'] = 'D1'
        self.rejected()

    def test_missing_or_unknown_role_fails_closed(self):
        for actor in (None, [], {}, 'reviewer', 'orchestrator'):
            with self.subTest(actor=actor):
                self.record['events'][1]['actor'] = actor
                self.rejected()

    def test_human_can_reject_a_passing_delivery(self):
        self.record['events'][-1] = {'type':'revise','actor':'developer','decision':'reject-D1','source':'dialogue:reject','reason':'Implementation does not fit intended responsibility ownership'}
        self.assertEqual(validate(self.record), 'dialogue')

    def test_empty_review_is_valid(self):
        self.record['events'][2]['findings'] = []
        self.record['events'][3]['dispositions'] = {}
        self.assertEqual(validate(self.record), 'accepted')

    def test_test_correction_preserves_candidate_and_provisional_approval(self):
        first = copy.deepcopy(self.record['events'][:5])
        correction = {'type':'request_test_correction','actor':'architect','revision':2,'candidate':'production-B','reason':'Test assertion did not represent approved behavior','changes_business_semantics':False,'outcomes':['R2'],'evidence':'invalid-test:1'}
        report = copy.deepcopy(self.record['events'][4])
        report.update(delivery='delivery-B-tests-2', report='test-report:B:2')
        acceptance = copy.deepcopy(self.record['events'][5])
        acceptance.update(delivery='delivery-B-tests-2', report='test-report:B:2')
        self.record['events'] = first + [correction, report, acceptance]
        self.assertEqual(validate(self.record), 'accepted')
        report['report'] = 'test-report:B'
        self.rejected()

    def test_test_correction_cannot_change_expected_behavior(self):
        correction = {'type':'request_test_correction','actor':'architect','revision':2,'candidate':'production-B','reason':'New business behavior','changes_business_semantics':True,'outcomes':['R2'],'evidence':'question:1'}
        self.record['events'] = self.record['events'][:5] + [correction]
        self.rejected()

    def test_uncertain_review_cannot_have_no_findings(self):
        self.record['events'][2].update(alignment='uncertain', findings=[])
        self.rejected()


if __name__ == '__main__':
    unittest.main()
