# Governance rules and enforcement limits

| ID | Rule | Automated reference check |
| --- | --- | --- |
| G01 | Only Developer approves contract, waiver, testing, test gaps and final acceptance | Actor, unique decision and explicit statement source |
| G02 | Implementation requires current approved contract and teach-back | State order, revision, rationale, vocabulary, architecture and teach-back reference |
| G03 | Test writing/execution follows business review or developer trivial waiver, then provisional approval | State order and candidate binding; early scenario-plan event does not authorize tests |
| G04 | In-scope unknown semantics block authorization | Knowledge-state validation; unknowns cannot be test expectations |
| G05 | Preserve verified existing behavior within approved scope unless directed otherwise | Versioned provenance and outcome mapping; no redundant preservation approval |
| G06 | Delegated choices need owner, bounds, escalation and rationale | Contract declaration and implementation choice record |
| G07 | Review must distinguish approved violations from newly discovered possibilities | Structured findings, classification, business impact and evidence; every finding dispositioned |
| G08 | Revisions and production fixes invalidate downstream approval | Monotonic revision, fresh candidate, repeated review/waiver and provisional approval |
| G09 | Final acceptance requires actual outcome-linked checks and human code review | Mandatory checks all pass; invariants covered; exact fresh delivery/report; explicit acceptance |
| G10 | Business Reviewer and Test Engineer cannot alter production semantics | Role policy; filesystem and content enforcement belongs to future runtimes |
| G11 | Approvals must be attributable, durable and authentic | References/uniqueness checked; identity authentication belongs to future runtimes |
| G12 | Stalled progress or new uncertainty returns control to Developer; no numeric retry default | Operational policy; no semantic progress detector or retry engine is implemented |
| G13 | Early planning uses only approved outcomes; waiver is trivial, technical and candidate-specific | Plan type/outcome checks; developer waiver cannot change business meaning or architecture |
| G14 | Test gaps need real scoped developer decisions; invariant checks are not optional | Prior gap approval bound to candidate/revision; mandatory checks cannot be waived in a report |
| G15 | Technical repairs do not reopen settled business decisions | Architect repair path retains revision, binds defect to approved outcomes and restarts downstream gates |
| G16 | Test corrections preserve approved semantics and unchanged production | Architect correction path requires new delivery/report; no reuse of stale passing evidence |

`tools/validate.py` replays one independently scoped change. The accepted JSON is fictional and is not evidence of real developer approval. The checker does not execute agents or production commands.

## Reference record version 2

Version 2 replaces the initial version 1 example. Older records are rejected explicitly, not silently migrated. The abstract specification remains draft 0.1.0; this is a reference-data format change, not a harness integration.

Contracts contain intent, rationale, shared vocabulary, architecture boundaries, risk, change type, typed requirements, invariant IDs and required check IDs. Contract approval references Architect teach-back. Reports contain structured business findings and actual per-check results. Test gaps are authorized by a separate developer event before a PASS report cites them. A PASS label cannot override a failing or omitted mandatory check.

The change event sequence, readable example and conformance tests specify the format together. Human transcript sources, artifact references and declared role identities are external evidence: the checker validates their consistency, not their truth. An arbitrary string is not authenticated approval; a future runtime must resolve and verify each source.

## What remains operational

A compliant future execution environment must enforce role write scopes, human identity, immutable artifact resolution, append-only decision history, stale approval rejection and stopping on stalled progress or new uncertainty. It must ensure a scenario-plan event really contains planning rather than hidden test execution and that a trivial waiver really meets its declared scope.

Automated reference checks cannot decide whether a scenario is valuable, a business rule is correct, a repair changes semantics, or two different evidence references describe the same stalled attempt. Those judgments remain with Developer–Architect dialogue and actual repository evidence. Record validation never substitutes for final human acceptance.

Malformed or unknown events fail closed. Block only affected work; independent change records retain their own authority. Ask needed choices directly, then record the answer. See the [source invariant audit](invariants.md) for which guarantees are mechanically checked and which remain role/runtime obligations.
