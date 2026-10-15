# Workflow, checkpoints, and iteration

The state machine is normative; storage and representation are not. Each independently scoped change starts in `dialogue`. An unrelated authorized change can continue while this change is blocked.

| From | Event | Actor | To | Required evidence |
| --- | --- | --- | --- | --- |
| dialogue | approve_contract | Developer | authorized | Exact immutable revision; Architect teach-back; approved outcomes and architecture; no relevant unknowns |
| authorized | submit_implementation | Implementer | implemented | Same revision; fresh immutable candidate; outcome mapping; delegated choices and actual verification |
| implemented | submit_business_review | Business Reviewer | reviewed | Same revision/candidate; independent scenarios before inspecting implementation; classified findings and alignment |
| implemented | waive_business_review | Developer | reviewed | Exact revision/candidate; Architect presents rationale; trivial technical change with no business or architecture change |
| reviewed | provisionally_approve | Developer | test_authorized | Architect presented review/waiver; each finding dispositioned; exact revision/candidate |
| authorized, implemented, reviewed, test_authorized | plan_tests | Test Engineer | unchanged | Approved revision and outcome IDs; scenario-plan evidence only; no test code or execution |
| test_authorized | approve_test_gap | Developer | unchanged | Exact revision/candidate and non-invariant outcomes; reason, impact and revisit trigger |
| test_authorized | submit_tests | Test Engineer | tested / test_failed / blocked | Exact revision/candidate and delivery/report; outcome coverage and actual required-check results; pass/fail/blocked |
| tested | accept | Developer | accepted | Passing required checks, authorized gaps, exact tested delivery, human code-review evidence and explicit acceptance |
| implemented, reviewed, test_authorized, tested, test_failed | request_repair | Architect | authorized | Reproducible defect tied to approved outcomes; unchanged contract; no new business meaning |
| tested, test_failed, test_authorized | request_test_correction | Architect | test_authorized | Invalid test or missing verification tied to approved outcomes; unchanged production candidate and expected behavior; fresh report/delivery required |
| any nonterminal except blocked | revise | Architect or Developer | dialogue | Intent reconciliation, reason and affected scope; invalidate downstream authorization |
| any nonterminal except blocked | block | any role | blocked | Blocker, owner and next action |
| blocked | resume | Architect or Developer | dialogue | Resolution evidence; current contract reauthorization |
| any nonterminal | cancel | Developer | cancelled | Explicit decision and reason; retain history |

`accepted` and `cancelled` are terminal. Later work starts a linked new run. Scout evidence does not advance state. An empty business review is valid; a skipped review requires the explicit waiver event. Provisional approval is required even after a waiver.

## Freshness and revisions

Contract revisions are immutable and monotonically increasing per change. A meaningful change to intent, scope, vocabulary or an invariant produces a new revision, reason and developer contract approval. An amendment contains the necessary differences, not a fresh reconstruction of the whole feature.

A technical fix within approved semantics uses `request_repair` under the same revision; it does not ask the developer to decide the same business rule again. Every new candidate repeats implementation → business review or new trivial waiver → provisional approval → testing → final acceptance. New business uncertainty cannot use this repair path. A defective test can instead use `request_test_correction`: preserve the unchanged production candidate and its provisional approval, correct only test artifacts under approved semantics, and generate fresh delivery/report evidence.

The candidate identifies the production snapshot. Delivery identifies that snapshot plus exact test artifacts and execution evidence. Production changes invalidate provisional approval and test evidence. Test-artifact changes after a report require a new report for the exact final delivery. Filenames alone cannot establish freshness.

## Early planning and risk-based review

Developer authorized early scenario planning and a developer-approved review waiver for trivial changes in the follow-up audit. Early planning uses approved expected outcomes; it cannot create requirements or write/execute tests early. A semantic revision makes old plans stale and requires a new plan binding before use.

A waiver applies only to one candidate of a trivial technical change. It records the developer's explicit decision, source and rationale as presented by Architect. Routine features receive lightweight review; new business functionality receives standard review; domain changes and financial/security-critical behavior receive deeper review and explicit resolution of material questions. No universal waiver or agent-selected shortcut exists.

## Escalation and direct dialogue

Unknown business meaning → Architect ↔ Developer, with scenario, evidence, options and trade-offs. Known technical defect → Architect → Implementer under the unchanged approved contract. Permission failures, unavailable evidence or tools, and contradictory repository facts block the affected work with an owner and next action. Never fabricate execution results or silently substitute behavior.

There is **no numeric retry default**. Escalate to Developer when progress stalls, the same failure recurs without new evidence, or new uncertainty appears. Present attempted fixes, evidence and the decision needed; stop dependent retries pending the answer. The reference checker does not assess progress semantically; future runtimes must provide evidence and enforce the stop.

Ask material policy questions directly in the active conversation. Record answers afterward. No response, elapsed time, or a question left in a repository file is approval.

## Human checkpoints

Contract approval authorizes implementation; provisional approval authorizes test writing/execution; final acceptance follows actual checks and human code review. These remain separate decisions. The developer can reject a passing implementation. Unambiguous conversational approval is valid when attributed and durably referenced; no special approval UI is required.
