---
name: agad-contract
description: Draft, refine, or validate an AGAD Living Domain Contract. Activates when user asks to establish domain rules, define architectural boundaries, draft a living contract, or invokes $agad-contract.
---

# AGAD Living Domain Contract

A Living Domain Contract is the explicit agreement between the Developer and the Architect before code is written.

## Contract Structure

Every Living Domain Contract must include:

1. **Header & Version**: Title, status (`Draft`, `Approved`, `Superseded`), version (`v1`, `v2`, ...), and timestamp.
2. **Intent**: Exactly one clear sentence describing the observable user- or caller-facing behavior to achieve.
3. **Rationale**: Design decisions, alternatives considered, and trade-offs made.
4. **Vocabulary**: Precise definitions of domain terms used in the contract.
5. **Architecture & Invariants**: Boundary rules that must hold under all circumstances (e.g., domain isolation, transaction boundaries, error handling policy).
6. **Requirements**: Concrete, checkable outcome statements labeled `R1`, `R2`, `R3`, etc. Every requirement must be verifiable. Any delegated implementation choices must state their rationale and bounds.
7. **Scope**:
   - Production file paths that may be created or modified.
   - Test file paths that may be created or modified.
   - Exact verification command arguments to run.
8. **Teach-back**: A concise explanation summarizing what will be built and how it behaves from the caller's perspective.

## Invariant Rules
- The contract requires explicit, unambiguous conversational approval from the Developer before implementation begins.
- Silence or absence of objection is never treated as approval.
- If new business semantics, architectural adjustments, or scope changes emerge during implementation or review, the contract must be revised to a new version and re-approved by the Developer.
