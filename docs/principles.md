# Principles and shared understanding

## Authority

The Developer is the business decision maker, architectural approval authority, human code reviewer, and final acceptance authority. The Architect is the interactive primary agent. No independent Orchestrator or AI code-review role is defined.

The Architect restates intent in concrete examples and counterexamples; asks about material gaps; proposes the smallest useful design; and records what the developer actually decided. Fluent explanation is not evidence of shared understanding. Ask the developer to correct the proposed outcomes before committing business semantics.

## Requirement knowledge states

Every requirement carries a stable ID, statement, knowledge state, source/evidence, applicability, and outcome or open question.

| State | Meaning | Allowed use |
| --- | --- | --- |
| confirmed | Developer explicitly decided the behavior | Implement within the approved scope |
| existing | Observed repository behavior, with versioned evidence | Preserve only when the developer approves preservation for this change; observation alone is not intent |
| delegated | Developer explicitly delegated a bounded choice | Named role may choose within stated bounds; record choice and rationale |
| unknown | Business meaning or applicability is unresolved | Investigate or ask; never convert a guess into a requirement |

Delegation identifies decision owner, allowed options/bounds, exclusions, and escalation trigger. Delegating a technical mechanism does not delegate business outcomes. A requirement's category is provenance, not confidence. Do not silently relabel existing behavior as confirmed.

Unknowns affecting in-scope observable outcomes block implementation authorization. Irrelevant possibilities can be excluded by the developer with a reason and revisit trigger. Discovering a scenario does not make it mandatory scope.

## Keep work proportionate

Use one small change and compact records. Scout is optional. The Implementer, Business Reviewer, and Test Engineer responsibilities remain distinct, but process count and invocation mechanism are outside the specification. A low-risk task can use a few sentences per artifact. Approval gates still apply.

Assess risk by business impact, reversibility, uncertainty, affected boundaries, and concurrency. High-impact or ambiguous work gets more scenario discussion and stronger evidence. Do not demand exhaustive edge-case enumeration. Default to existing architecture and avoid speculative infrastructure.

## Feedback, not a specification waterfall

Implementation and discovered scenarios feed the domain dialogue. A contract is a versioned shared model, not a one-time requirements dump. Vocabulary, invariants, examples, and code evolve together. Technical evidence can challenge a proposal; only the developer decides new business meaning.
