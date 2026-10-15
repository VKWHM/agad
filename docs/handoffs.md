# Handoff contracts

Every handoff includes `change_id`, contract ID/revision, sender role, recipient role, immutable artifact references, in-scope outcome IDs, evidence sources, unresolved questions, stop conditions, and expected return. Keep context task-specific; do not copy the whole conversation to every role.

| Handoff | Payload | Receiver must verify |
| --- | --- | --- |
| Architect → Scout | Question, repository snapshot, allowed read scope, desired evidence | Exploration is needed and read-only |
| Scout → Architect | Facts with path/version, existing behavior, uncertainties | Observations are not approved semantics |
| Architect → Implementer | Developer-approved contract, architecture and allowed paths, exclusions, delegated choices | Approval is current; outcomes are implementable; unknowns do not affect scope |
| Implementer → Architect → Business Reviewer | Candidate ID, outcome mapping, changed paths, checks and deviations | Same contract/candidate; inspect business alignment independently |
| Business Reviewer → Architect ↔ Developer | Findings, alignment status aligned/misaligned/uncertain; evidence, impact, questions | Each finding is a violation, new scenario, ambiguity, or risk; speculation is labeled |
| Architect → Test Engineer | Provisional developer approval, finding dispositions, exact candidate, approved outcomes/invariants | Approval follows business review and covers current candidate |
| Test Engineer → Architect → Developer | Delivery reference, covered/missing outcome IDs, actual commands/results, defects, gaps and risks | Required checks passed; gaps are explicit; code diff is available for human review |

Business Reviewer first derives scenarios independently from approved requirements and invariants, then inspects the candidate. Reports include alignment, classification and impact; an IDs-only findings list is insufficient in the reference format.

Each business finding includes an ID, classification, scenario, relevant requirement (or explicitly none), evidence, business impact, recommended question, and disposition. Dispositions are developer decision references: resolved under current contract, contract revision required, excluded with reason/revisit trigger, or accepted risk. Accepted risk cannot silently negate a mandatory approved outcome; change that contract first.

Test reports distinguish failing implementation, invalid test, infrastructure blockage, and unresolved expected behavior. Unknown expected behavior returns to dialogue. A report of PASS with missing required checks is invalid. A bounded, developer-approved test gap must record reason, impact and revisit trigger before acceptance.

The Architect must present the actual code diff, rationale, tests executed, architectural deviations, and remaining uncertainties for developer review. Feedback returns through intent reconciliation before implementation changes.

See [templates](../templates/) for compact prose records. The JSON example demonstrates machine-checkable references, not a required storage format.
