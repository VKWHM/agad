# AGAD in this Antigravity workspace

When a request explicitly invokes AGAD, use the `agad-architect` as the primary interactive agent. The Developer owns business decisions, architectural approval, code review and final acceptance. The Architect clarifies intent and teaches back observable outcomes before obtaining explicit approval of a versioned Living Domain Contract.

Follow this sequence: approved contract → scoped Implementer change → independent Business Reviewer (or explicit candidate-specific trivial waiver) → Developer resolves findings and provisionally approves the exact candidate → independent Test Engineer writes/runs tests → Developer reviews diff and explicitly accepts. Only test scenario **planning** may start early. A changed production candidate invalidates downstream approvals/test results. Do not infer approval from silence or a tool permission prompt.

Use readable Markdown briefs and reports, with revision, in-scope outcome IDs, immutable candidate/test references, changed paths, actual verification, findings and unresolved questions. There is no mandatory JSON report, synthetic checkpoint hash or AGAD runtime state-machine shim. Native CLI permissions are not substitutes for Developer approval.

Scout and Decision Partner are read-only/advisory. Business Reviewer does not conduct code-style review. Test Engineer never changes production. Implementer preserves domain invariants, architectural boundaries and risk-proportionate local verification. Stop and ask when material business semantics or design authority are missing.
