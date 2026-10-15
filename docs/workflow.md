# Workflow, checkpoints, and iteration

The state machine is normative; the representation and storage are not. Each run starts in `dialogue`.

| From | Event | Actor | To | Required evidence |
| --- | --- | --- | --- | --- |
| dialogue | approve_contract | Developer | authorized | Exact immutable contract revision; approved outcomes and scope; no relevant unknowns |
| authorized | submit_implementation | Implementer | implemented | Approved revision, immutable candidate ID, outcome mapping and verification |
| implemented | submit_business_review | Business Reviewer | reviewed | Same revision and candidate; classified findings (empty list is valid) |
| reviewed | provisionally_approve | Developer | test_authorized | Architect presented findings; every finding resolved, explicitly excluded, or accepted as a known risk; exact revision/candidate |
| test_authorized | submit_tests | Test Engineer | tested | Approved revision/candidate; outcome coverage, execution evidence, pass/fail and remaining gaps |
| tested | accept | Developer | accepted | Passing required checks, justified coverage gaps, code-review evidence, explicit acceptance of exact delivery |
| any nonterminal | revise | Architect or Developer | dialogue | Reason and affected scope; preserve history, invalidate downstream authorization |
| any nonterminal | block | any role | blocked | Blocker, owner, next action and safe work that may continue |
| blocked | resume | Architect or Developer | dialogue | Resolution evidence; new approvals required |
| any nonterminal | cancel | Developer | cancelled | Reason; retain history |

`accepted` and `cancelled` are terminal. A later change starts a new run linked to its predecessor. Scout exploration does not advance state. Business Reviewer findings never directly authorize edits or testing.

## Freshness and revisions

Contract revisions are immutable and monotonically increasing per change. Revision 2 supersedes revision 1; it never edits its approval retroactively. Any semantic/scope change requires a new revision and developer contract approval. A code-only fix may reuse the contract revision but must create a new candidate and repeat implementation → business review → developer provisional approval → tests → final acceptance.

An immutable candidate identifies the production snapshot. A delivery identifies that candidate plus the exact test artifacts and execution evidence; the developer reviews and accepts this delivery. If production changes after provisional approval, testing authorization is stale. Changes to tests after a passing report require a new report for the final delivery. Reports cannot be reused merely because the file names match.

## Escalation

Unknown business meaning → Architect ↔ Developer, with scenario, evidence, options and trade-offs. Confirmed implementation defect → Architect → Implementer under the approved contract; repeat downstream gates. Unavailable tool/model, permission failure, or contradictory repository evidence → block the affected task and state what can proceed. Never silently substitute behavior or fabricate execution results.

Set an iteration budget proportional to task risk during dialogue (default proposal: two unsuccessful repair cycles). On exhaustion, stop automatic retries and request a developer decision: rescope, clarify, continue with a new budget, or cancel. Elapsed time and silence never count as approval. Unrelated exploration may continue while a business question waits, but dependent implementation must stop.

## Human checkpoints

Contract approval authorizes implementation; provisional approval authorizes independent testing; final acceptance follows code review. Each is a separate, explicit human decision bound to exact evidence. A conversational answer can count when unambiguous and durably recorded with its source; no mandatory approval ceremony or special UI is required.
