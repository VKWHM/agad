# Source invariant audit

Audited against **AI Kodlama Modeli**, conversation `6ad06522-a15c-83eb-b52f-127cb4bc484a`, and the developer's current instructions. This audit checks the abstract specification and reference records; it does not claim an agent runtime is installed.

## Source precedence

1. Current explicit developer instructions and direct answers control.
2. The developer's central-role redesign (turn `8b6d21b9-be8e-4152-a2bd-f46f074b185e`) removes AI code review and requires direct Architect dialogue and human review.
3. The developer's business-review workflow (turn `c3527c29-ef29-4b46-b93b-5303b559049e`) adds post-implementation business discovery before testing and preserves developer decisions.
4. The abstraction-first request (turn `eb513dce-cf73-429c-896c-b9ca0c06eed4`) separates the core from future harness integrations.
5. Earlier assistant proposals are context, not automatic developer approval. The complete final AGAD 3.0 response supplies the detailed reference model where consistent with the developer's direction. Older Orchestrator/code-review structures and parallel test execution are superseded. Earlier assistant responses available through thread retrieval are bounded at 20,000 characters; no claim is made about inaccessible response tails.

The current direct answers allow early planning and a developer-approved trivial review waiver, and reject a numeric retry default. See [recorded decisions](decisions.md). They resolve the corresponding optional suggestions in the earlier discussion.

## Invariants and evidence

| ID | Preserved invariant | Specification / automated evidence | Limit |
| --- | --- | --- | --- |
| I01 | Developer owns intent, business decisions, architecture approval and final acceptance | roles; G01; agent-approval and human-rejection conformance tests | Identity requires runtime verification |
| I02 | Architect is the direct interactive primary partner and coordinator; no separate Orchestrator | roles, principles, handoffs; unknown-role rejection tests | Interaction quality is a role obligation |
| I03 | Human reviews generated code; Business Reviewer is not a code reviewer | roles; G09; code-review-required test | Checker cannot perform the human review |
| I04 | Developer ↔ Architect → approved contract → Implementer → business review → Architect ↔ Developer → Test Engineer → human code review/acceptance | workflow; state replay and gate-skipping tests | Trivial waiver is the explicit developer-authorized exception |
| I05 | Business Reviewer discovers scenarios, distinguishes violations from possibilities and never decides semantics | roles, handoffs; G07; structured-finding and violation-disposition tests | Scenario completeness is judged through dialogue |
| I06 | No agent invents business meaning; confirmed/existing/delegated/unknown remain distinct | principles; G04–G06; unknown/delegation tests | Classifying a business change requires domain judgment |
| I07 | Existing architecture and behavior are preserved unless a change is approved; ordinary technical choices need no interrogation | principles, roles; existing-preservation test | Actual code boundaries need future repository enforcement |
| I08 | Architect teaches back observable outcomes separately from recommended implementation; investigates before asking | principles; contract teach-back check/test | Semantic understanding cannot be proved by a reference |
| I09 | Compact versioned Living Domain Contract carries shared language, invariants, evidence and decision rationale across roles | template; contract fields and revision checks | Runtime must resolve immutable snapshots |
| I10 | Developer feedback is reconciled through Architect and targeted amendments | principles, workflow, handoffs; revision-invalidates-approval test | Amendment content still needs developer review |
| I11 | Technical defects can be corrected under unchanged approved semantics without reopening business decisions | G15; repair tests; candidate-bound downstream gates repeat | A repair declaration is not proof of semantic equivalence |
| I12 | Test Engineer derives expectations from approved outcomes and never fixes production or weakens tests | roles; G09, G10, G14; actual check and invariant coverage tests | Filesystem and test-quality enforcement need runtime/human checks |
| I13 | Failed/blocked verification is reported honestly; missing or failing mandatory checks cannot become PASS | G09; failed/blocked report tests; mandatory-check omission tests | Actual execution evidence must be verified externally |
| I14 | Provisional approval permits testing, not final acceptance; developer can reject passing code | workflow; separate approval events; human-rejection test | Explicit human statement is required |
| I15 | Risk-based lightweight work; optional Scout; bounded consequential findings and minimal context copying | principles, roles, handoffs | Resource efficiency has not been empirically measured |
| I16 | Early scenario planning is permitted; test writing/execution still gated | G03, G13; planning allow/reject tests | Future runtime must distinguish planning from execution |
| I17 | Trivial business-review waiver is explicit, human, candidate-specific and never a blanket shortcut | G01, G13; waiver role/risk/freshness/provisional-approval tests | Triviality is an evidenced developer judgment |
| I18 | Stalled progress or new uncertainty is escalated directly; no invented numeric retry default | workflow, decisions, role rules; G12 | Semantic stall detection is operational, not implemented here |
| I19 | Stop only affected work; preserve history and resume with fresh authority | workflow; block/resume and stale-evidence tests | Independent work uses independently scoped records |
| I20 | New candidate or changed test artifacts cannot reuse stale acceptance evidence | G08, G16; candidate, report and delivery freshness tests | Runtime must verify artifact contents |
| I21 | Core stays independent of all harnesses; future model allocations do not become core dependencies | README, roles, AGENTS.md; no runtime/provider dependency | Harness adapters remain out of scope |
| I22 | Ask decisions directly in active dialogue and record answers afterward | roles, workflow, AGENTS.md; direct questions answered in this audit | No file-based pending decision queue |

The payment capture and webhook invariants used in the earlier discussion are examples of application contracts: cumulative capture bounds, idempotent effects, concurrency, expiry and conflicting evidence. They are not universal AGAD business rules. AGAD preserves their representation and approval mechanism without inventing a payment product's policies.

## Corrections made during this audit

Removed redundant preservation approval; restored explicit teach-back, role safeguards, independent scenario derivation, technical repair handling and test-only corrections. Added structured findings, mandatory-check results and scoped test-gap decisions. Added the directly approved planning/waiver policy and removed the unapproved two-cycle retry proposal. Documentation records answers already given, not choices left for the developer to find on GitHub.
