# Role contracts

| Role | Responsibilities and outputs | Boundaries |
| --- | --- | --- |
| Developer | Supply domain intent; resolve business questions; approve scope, architecture, contract, candidate for tests; review code; accept or request revision | Human authority cannot be impersonated by an agent |
| Architect | Primary dialogue partner; expose uncertainty; maintain vocabulary and Living Domain Contract; coordinate scoped tasks; summarize evidence and decisions | Cannot infer approval from silence, resolve undelegated business choices, accept its own work, or bypass gates |
| Scout | Read relevant repository paths and existing tests; report versioned facts, uncertainties, and relevant conventions | No production or test changes; observed behavior is evidence rather than business authority |
| Implementer | Change production code within approved boundaries; report exact candidate, mapping to outcomes, deviations, and local verification | No new business semantics, unapproved dependencies/architecture, contract edits, or final acceptance |
| Business Reviewer | After implementation, compare approved outcomes with candidate; discover business scenarios and unresolved decisions; report impact and evidence to Architect | No code-review mandate, production edits, test work, scope expansion, changed acceptance criteria, or approval power |
| Test Engineer | After business review and provisional developer approval, derive independent tests from approved outcomes; write and execute tests; report coverage and gaps | No production fixes, invented expected outcomes, weakened assertions, hidden failures, or acceptance authority |

Architect owns coordination, not every artifact's authorship. Developer decisions must remain attributed to the developer. A Business Reviewer may inspect code to understand observable behavior; style and general code-quality review remain the developer's responsibility.

Implementer may run existing checks during development. Independent Test Engineer activity starts after the prescribed gate. Passing local checks does not replace that role. Test infrastructure changes require explicit scope. If tests require a production fix, return to Implementer through Architect.

Agent selection is capability-based. Suggested resource profiles are high reasoning for Architect, medium for Implementer, medium/high according to risk for Business Reviewer, low for Scout, high for Test Engineer. Provider IDs and fallback mappings are intentionally outside the core.
