---
name: agad-contract
description: Draft, refine, or validate an AGAD Living Domain Contract. Activates when user asks to establish domain rules, define architectural boundaries, draft a living contract, or invokes $agad-contract.
---

# AGAD Living Domain Contract

> **Role mapping:** This skill is performed by the Architect session (the one running `$agad`). Delegate repository evidence to `scout` and trade-off advice to `decision-partner`, always spawned by `agent_type`, never as a generic worker or with a model override.

The contract is the versioned agreement between Developer and Architect before code is written.

## Structure
1. **Header**: change ID, integer revision, status (`Draft`, `Approved`, `Superseded`), reason for revision.
2. **Intent**: one sentence of observable behavior.
3. **Rationale** and **Vocabulary**.
4. **Architecture & Invariants**: boundary rules, the accepted precedent (path/revision or decision reference) or the reason none applies, and any justified divergence. Check nearby and cross-context analogues and recorded architecture decisions first; do not force a universal abstraction.
5. **Risk** (`trivial`, `routine`, `standard`, `critical`) and **change type** (`business`, `technical`).
6. **Requirements** `R1`, `R2`, ...: each checkable, with a source and a knowledge state: `confirmed`, `existing` (versioned evidence; never relabeled confirmed), `delegated` (owner, bounds, exclusions, escalation trigger, recorded rationale), or `unknown`.
7. **Scope**: disjoint production paths, test paths, exact verification command argument lists, and the required/invariant checks.
8. **Teach-back**: the observable behavior in the Architect's own words, separate from mechanisms.

## Rules
- Unknowns affecting in-scope outcomes block approval. The Developer may exclude an irrelevant one with a reason and revisit trigger; discovering a scenario does not make it scope.
- Only an explicit, attributable Developer statement approves a specific revision. Silence is never approval.
- Meaningful changes create a new revision with a reason and fresh approval, invalidating downstream authorization. Technical fixes within approved semantics do not reopen settled business decisions.
