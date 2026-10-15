# Worked example: reservation cancellation

This fictional example demonstrates process, not a recommended business policy.

The Developer requests cancellation of a draft reservation. Architect asks what “draft” means and whether sent reservations can be cancelled. Developer confirms draft cancellation, excludes sent reservations from this change, and asks the Architect to preserve their verified existing behavior. No separate approval is needed for each existing convention.

Contract reservation-cancel revision 1 defines R1: cancelling a draft transitions it to cancelled. R2: attempts on sent reservations preserve the existing rejection. The developer approves revision 1. Implementer submits candidate production-A.

Business Reviewer finds F1: cancelling an already-cancelled reservation has unspecified semantics. It reports a newly discovered scenario, not a requirement violation. Architect presents the question. Developer chooses idempotent success, producing R3 and revision 2. Revision 1 authorization no longer applies.

After explicit approval of revision 2, Implementer submits production-B. Business Reviewer reports alignment, with a non-blocking question about future notifications. Developer excludes notifications with a revisit trigger and provisionally approves production-B for testing.

Test Engineer derives draft, sent, and repeated-cancellation outcomes from the approved contract, executes checks, and reports exact production-B plus test artifacts as delivery-B. Developer reviews the diff and evidence, then explicitly accepts delivery-B.

If a test exposes a defect in production-B, Architect requests a technical repair without another business decision, and Implementer creates production-C under revision 2 and business review plus provisional approval repeat. If the expected outcome itself is unknown, return to Developer–Architect dialogue and version the contract.

Early test scenario planning is allowed from the approved contract. This change introduces business behavior, so it cannot use the trivial technical review waiver. If repeated repair attempts stop making progress, Architect asks the Developer directly how to proceed; no fixed retry count applies.

The accompanying JSON keeps only the successful revision-2 cycle for a small executable illustration; its decision references and identities are fictional.
