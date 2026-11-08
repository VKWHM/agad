---
description: Run an independent AGAD Business Review on the candidate implementation
argument-hint: Candidate commit, diff, or scope to review
---

# AGAD Business Review

Run an independent business review of the candidate: $ARGUMENTS

1. Confirm the approved contract revision and the exact candidate reference. A review applies to one candidate; a new production change needs a new review or a new Developer waiver.
2. Delegate to `@business-reviewer`. It derives scenarios from the approved contract **before** inspecting the candidate.
3. Findings are classified as `violation`, `new scenario`, `ambiguity` or `risk`, each with scenario, requirement (or none), evidence, business impact and a question. An empty list is valid.
4. Present findings to the Developer. Every finding needs a Developer disposition: resolved under the current contract, contract revision required, excluded with reason and revisit trigger, or accepted risk (never against a mandatory approved outcome).
5. The Business Reviewer is not a code reviewer and has no approval power. Waiving review is only the Developer's call, for a trivial technical change and that one candidate; a waiver is not provisional approval.
