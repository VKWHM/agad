---
description: Run AGAD automated outcome verification under provisional developer approval
argument-hint: Approved contract outcomes to verify
---

# AGAD Automated Verification

Verify approved outcomes: $ARGUMENTS

1. Scenario *planning* from approved outcomes may start once the contract is approved, without writing or running tests.
2. Before `@test-engineer` writes or runs anything, confirm: business review done or Developer waiver for this exact candidate, **and** explicit Developer provisional approval of this exact, unchanged production candidate. If production changed, those approvals are stale.
3. The Test Engineer writes only in contract test paths, runs only declared commands, never edits production, and reports real results without weakening assertions.
4. Mandatory and invariant checks cannot be waived; a non-invariant gap needs a prior scoped Developer decision (reason, impact, revisit trigger).
5. Routing: technical defect under an unchanged contract → `@implementer` repair (then a fresh review/waiver and provisional approval); defective test → test-only correction with a fresh report; unknown expected behavior → Architect and Developer.
6. Passing tests do not accept the work. The Developer reviews code and decides.
