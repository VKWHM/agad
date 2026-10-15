# Recorded decisions

This is a record of decisions already given and technical representation conventions. It is not a pending approval queue. Material questions must be asked directly in the active developer–Architect conversation before dependent work proceeds.

## Developer direction

- AGAD means Architecture-Governed Agentic Development.
- Developer retains business authority, architectural approval, code review and final acceptance.
- Architect is the interactive coordinator; no independent Orchestrator or AI code reviewer.
- Business Reviewer discovers business scenarios after implementation and returns findings through Architect to Developer.
- Test writing/execution follows business review and provisional developer approval; final acceptance follows tests and human code review.
- This repository covers abstraction only. Harness implementations are deferred.

## Direct decisions in the follow-up audit, 2026-10-15

Asked: whether to preserve strict ordering or allow earlier planning and a trivial review waiver.

Developer answered: **Allow early planning and a developer-approved review waiver for trivial changes.** Planning does not authorize test writing/execution. Each waiver is an explicit developer decision for the exact candidate, with its trivial-risk rationale; new candidates require fresh review or waiver.

Asked: how to handle repeated unsuccessful repairs.

Developer answered: **Do not set a numeric budget; escalate when progress stalls or uncertainty appears.** The earlier assistant-proposed two-cycle default is removed. No agent may continue a stalled loop by silently broadening scope.

## Representation conventions

Specification 0.1.0 is a draft, not a claim of developer final acceptance. Integer immutable contract revisions and distinct production-candidate/delivery references make approval freshness explicit. The JSON reference format is versioned independently. Python is a standard-library reference validator, not a required core implementation language. These are reversible representation choices, not additional business policy.

## Deferred scope

Harness adapters, execution isolation, authentication storage, provider IDs and approval UI remain outside this stage. The private repository has no distribution license selected; licensing is not a dependency of this private abstraction work. Ask the owner directly if publication or distribution is proposed.
