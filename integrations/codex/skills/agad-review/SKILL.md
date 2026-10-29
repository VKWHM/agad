---
name: agad-review
description: Conduct an AGAD Business Review on proposed changes or implementation candidates. Evaluates domain scenarios, edge cases, and invariant preservation before inspecting code. Activates when invoking $agad-review.
---

# AGAD Business Review

The Business Reviewer evaluates the domain model and observable behavior. **The Business Reviewer is NOT a code reviewer.** Code formatting, linting, and style are handled by normal developer tools and final developer code review.

## Review Principles

1. **Independent Scenario Derivation**: Derive domain scenarios from the approved contract and business context *before* inspecting the code candidate.
2. **Invariant Verification**: Check whether all domain invariants and boundary rules are preserved under normal conditions and edge cases.
3. **Edge Case Discovery**: Test boundary conditions, concurrent access, failure states, empty collections, and unusual business ordering.
4. **Surface Ambiguities**: If a domain rule or business meaning is unclear, surface it as a question for the Developer. Never assume or guess.
5. **Explicit Dispositions**: Every finding must be classified:
   - `defect`: Violates approved contract or domain invariant (requires fix).
   - `question`: Unclear business rule (requires Developer resolution).
   - `accepted-risk`: Known trade-off explicitly accepted by the Developer.
   - `false-positive`: Finding retracted after architectural evidence.
