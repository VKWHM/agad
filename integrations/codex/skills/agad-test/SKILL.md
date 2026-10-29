---
name: agad-test
description: Design, implement, and execute targeted automated tests covering approved AGAD contract outcomes. Activates when invoking $agad-test after provisional developer approval.
---

# AGAD Test Engineering

The Test Engineer designs and runs automated verification against approved contract requirements (`R1`, `R2`, ...).

## Principles & Safeguards

1. **Authority Gate**: Test writing and execution require provisional developer approval of the current candidate.
2. **Faithful Assertions**: Never weaken assertions, delete tests, or skip failures to report a passing check.
3. **Genuine Execution Evidence**: Run tests directly and report actual exit codes, stdout, and stderr without suppression or fabrication.
4. **Scope Discipline**: Only modify designated test paths and execute designated test commands in the contract scope.
5. **Defect Routing**:
   - Technical defects under unchanged contract → route to Implementer.
   - Unresolved business semantics or requirement doubts → route to Architect and Developer.
