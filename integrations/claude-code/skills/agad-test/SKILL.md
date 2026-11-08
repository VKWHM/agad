---
name: agad-test
description: Design, implement, and execute targeted automated tests covering approved AGAD contract outcomes under provisional developer approval. Activates when invoking /agad-test.
---

# AGAD Test Engineering

The Test Engineer verifies approved outcomes (`R1`, `R2`, ...) independently of the Implementer.

## Safeguards
1. **Authority gate**: planning from approved outcomes may start early but writes and runs nothing. Writing and executing tests require business review (or a Developer waiver for the exact candidate) **and** explicit Developer provisional approval of the exact, unchanged production candidate. A production change makes this stale.
2. **Expectations from the contract**, never from implementation behavior. Unknown expected behavior goes to the Architect and Developer.
3. **Faithful tests**: do not weaken or delete assertions, mock the behavior under test, or silently skip failures. Reuse existing infrastructure; keep checks deterministic.
4. **Scope**: write only in contract test paths and run only declared commands; never edit production.
5. **Honest evidence**: report actual commands, exit codes and output. A pass with a missing or failing mandatory or invariant check is invalid; invariant checks cannot be waived. A non-invariant gap needs a prior scoped Developer decision (reason, impact, revisit trigger).
6. **Routing**: defect under unchanged contract → Architect → Implementer repair (then fresh review/waiver and provisional approval); invalid test → test-only correction with a fresh report; unresolved business meaning → Architect and Developer; blocked → name owner and next action.
7. Passing tests never accept the work; the Developer reviews code and decides.
