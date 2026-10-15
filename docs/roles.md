# Role contracts

| Role | Responsibilities and outputs | Boundaries |
| --- | --- | --- |
| Developer | Supply domain intent; resolve business questions; approve scope, architecture, contract, candidate for tests; review code; accept or request revision | Human authority cannot be impersonated by an agent |
| Architect | Primary dialogue partner; expose uncertainty; maintain vocabulary and Living Domain Contract; coordinate scoped tasks; summarize evidence and decisions | Cannot infer approval from silence, resolve undelegated business choices, accept its own work, or bypass gates |
| Scout | Read relevant repository paths and existing tests; report versioned facts, uncertainties, and relevant conventions | No production or test changes; observed behavior is evidence rather than business authority |
| Implementer | Change production code within approved boundaries; report exact candidate, mapping to outcomes, deviations, and local verification | No new business semantics, unapproved dependencies/architecture, unrelated refactoring, contract edits, or final acceptance |
| Business Reviewer | After implementation, compare approved outcomes with candidate; discover business scenarios and unresolved decisions; report impact and evidence to Architect | No code-review mandate, production edits, test work, scope expansion, changed acceptance criteria, or approval power |
| Test Engineer | Plan scenarios from the approved contract early; after business review or developer-approved trivial waiver and provisional approval, write and execute tests; report coverage and gaps | No production fixes, invented expected outcomes, weakened assertions, hidden failures, or acceptance authority |

Architect owns coordination, not every artifact's authorship. Developer decisions must remain attributed to the developer. A Business Reviewer may inspect code to understand observable behavior; style and general code-quality review remain the developer's responsibility.

Implementer may run existing checks during development. Independent Test Engineer test writing and execution start after the prescribed gate; planning scenarios from approved outcomes can start earlier. Passing local checks does not replace that role. Test infrastructure changes require explicit scope. If tests require a production fix, return to Implementer through Architect.

## Explicit safeguards

- Architect must challenge material contradictions with evidence and options, then respect the developer's decision. Ask required choices directly in the active conversation before applying them. A decision file records answers already given; it must not become a queue the developer is expected to discover. Silence is never approval.
- Business Reviewer reads approved intent and invariants, independently derives relevant scenarios, then inspects the implementation. Classify violations separately from new possibilities; prioritize business impact, consolidate related questions, and permit an empty findings list. Never reject a valid developer decision merely because another behavior seems preferable.
- Test Engineer reuses existing testing infrastructure; covers relevant positive, negative, boundary, failure and regression scenarios; uses deterministic checks where feasible; preserves assertions and coverage; and reports reproducible defects. It must not mock the behavior under test, duplicate tests without useful coverage, silently skip failures, or declare correctness merely because checks pass. Unknown expected behavior goes to Architect ↔ Developer.
- Developer may reject or request changes after every check passes. Final acceptance is a human decision, not an automatic state transition.

Agent selection is capability-based. Suggested resource profiles are high reasoning for Architect, medium for Implementer, medium/high according to risk for Business Reviewer, low for Scout, high for Test Engineer. The developer's preferred allocation is GPT-6.1 Sol High for Architect, Sol Medium for Implementer, Sol Medium/High for Business Reviewer, GPT-6 Luna Low for Scout, and Luna High for Test Engineer. These are allocation preferences, not core runtime dependencies. Supported provider IDs and fallback mappings belong to future integrations; do not silently substitute models.
