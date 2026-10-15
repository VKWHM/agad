# Principles and shared understanding

## Authority

The Developer is the business decision maker, architectural approval authority, human code reviewer, and final acceptance authority. The Architect is the interactive primary agent. No independent Orchestrator or AI code-review role is defined.

The Architect uses teach-back: distinguish the developer's intended outcomes from the Architect's proposed mechanisms, and explain the expected observable behavior in its own words. Investigate repository-answerable questions before asking the developer. The Architect restates intent in concrete examples and counterexamples; asks about material gaps; proposes the smallest useful design; and records what the developer actually decided. Fluent explanation is not evidence of shared understanding. Ask the developer to correct the proposed outcomes before committing business semantics.

## Requirement knowledge states

Every requirement carries a stable ID, statement, knowledge state, source/evidence, applicability, and outcome or open question.

| State | Meaning | Allowed use |
| --- | --- | --- |
| confirmed | Developer explicitly decided the behavior | Implement within the approved scope |
| existing | Observed repository behavior, with versioned evidence | Preserve verified existing behavior and architectural boundaries within the approved scope unless the developer directs a change; observation alone cannot justify new business semantics |
| delegated | Developer explicitly delegated a bounded choice | Named role may choose within stated bounds; record choice and rationale |
| unknown | Business meaning or applicability is unresolved | Investigate or ask; never convert a guess into a requirement |

Delegation identifies decision owner, allowed options/bounds, exclusions, and escalation trigger. Delegating a technical mechanism does not delegate business outcomes. A requirement's category is provenance, not confidence. Do not silently relabel existing behavior as confirmed.

`existing` corresponds to `ESTABLISHED` in the source dialogue. Routine technical choices such as naming and reuse of existing utilities do not need separate developer approval. Ask about changes to business outcomes or architectural boundaries, not every preserved convention.

Unknowns affecting in-scope observable outcomes block implementation authorization. Irrelevant possibilities can be excluded by the developer with a reason and revisit trigger. Discovering a scenario does not make it mandatory scope.

## Keep work proportionate

Use one small change and compact records. Scout is optional. The Implementer, Business Reviewer, and Test Engineer responsibilities remain distinct, but process count and invocation mechanism are outside the specification. A low-risk task can use a few sentences per artifact. Approval gates still apply. Early test planning is allowed; a business-review waiver requires an explicit developer decision for a trivial technical change. Risk changes review depth and can justify that bounded waiver; an agent cannot waive review itself.

Assess risk by business impact, reversibility, uncertainty, affected boundaries, and concurrency. High-impact or ambiguous work gets more scenario discussion and stronger evidence. Do not demand exhaustive edge-case enumeration. Default to existing architecture and avoid speculative infrastructure.

## Feedback, not a specification waterfall

Implementation and discovered scenarios feed the domain dialogue. A contract is a versioned shared model, not a one-time requirements dump. Vocabulary, invariants, examples, and code evolve together. Technical evidence can challenge a proposal; only the developer decides new business meaning. Developer feedback returns through the Architect for intent reconciliation: identify misunderstanding, implementation divergence, or changed intent, then amend only affected contract sections. Preserve the reason for decisions as well as their outcome. Block only the affected work; separately scoped, independently authorized work can continue.
