---
description: Draft, refine, or validate an AGAD Living Domain Contract
argument-hint: Contract draft or feature topic
---

# AGAD Living Domain Contract

Draft or refine a Living Domain Contract for: $ARGUMENTS

Ensure the contract includes:
1. **Header**: change ID, integer revision (immutable, increasing), status (`Draft`, `Approved`, `Superseded`), reason for revision.
2. **Intent**: exactly one sentence of observable behavior.
3. **Rationale** and **Vocabulary**.
4. **Architecture & Invariants**: boundaries, plus the accepted precedent (path/revision or decision reference) or why none applies and any deliberate divergence. Inspect nearby and cross-context analogues first; an existing example alone is not authority.
5. **Risk** (`trivial`, `routine`, `standard`, `critical`) and **change type** (`business`, `technical`).
6. **Requirements** `R1`, `R2`, ... each with a knowledge state (`confirmed`, `existing` with versioned evidence, `delegated` with owner, bounds, exclusions and escalation trigger, or `unknown`) and a source. Unknowns in scope block approval unless the Developer explicitly excludes them with a reason and revisit trigger.
7. **Scope**: disjoint production paths, test paths, and exact verification command argument lists; name the required and invariant checks.
8. **Teach-back**: observable behavior in your own words, separate from mechanisms.

Ask the Developer to approve this exact revision. Only an explicit, attributable Developer statement is approval. A meaningful change to intent, scope, vocabulary or an invariant creates a new revision and requires fresh approval; downstream approvals, candidates and test evidence for the old revision are stale.
