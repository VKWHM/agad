# Recorded decisions

This is a record of decisions already given and technical representation conventions. It is not a pending approval queue. Material questions must be asked directly in the active developer–Architect conversation before dependent work proceeds.

## Developer direction

- AGAD means Architecture-Governed Agentic Development.
- Developer retains business authority, architectural approval, code review and final acceptance.
- Architect is the interactive coordinator; no independent Orchestrator or AI code reviewer.
- Business Reviewer discovers business scenarios after implementation and returns findings through Architect to Developer.
- Test writing/execution follows business review and provisional developer approval; final acceptance follows tests and human code review.
- This repository covers abstraction only. Harness implementations are deferred.

## Direct decisions in the follow-up audit, 2026-10-15

Asked: whether to preserve strict ordering or allow earlier planning and a trivial review waiver.

Developer answered: **Allow early planning and a developer-approved review waiver for trivial changes.** Planning does not authorize test writing/execution. Each waiver is an explicit developer decision for the exact candidate, with its trivial-risk rationale; new candidates require fresh review or waiver.

Asked: how to handle repeated unsuccessful repairs.

Developer answered: **Do not set a numeric budget; escalate when progress stalls or uncertainty appears.** The earlier assistant-proposed two-cycle default is removed. No agent may continue a stalled loop by silently broadening scope.

## Representation conventions

Specification 0.1.0 is a draft, not a claim of developer final acceptance. Integer immutable contract revisions and distinct production-candidate/delivery references make approval freshness explicit. The JSON reference format is versioned independently. Python is a standard-library reference validator, not a required core implementation language. These are reversible representation choices, not additional business policy.

### OMP communication and inspection, 2026-10-15

Asked: whether Markdown should replace agent handoffs only or also authoritative worker reports.

Developer selected **Markdown handoffs; validated records**: concise Markdown for briefs and advisory exchanges; retain machine-validated workflow reports, exact IDs and human approvals. The working Test Engineer's prompts, report contract and approved-check execution remain unchanged. This is an integration representation choice, not a change to core governance.

Developer requested the main Architect conversation on the left and a smaller, question-scoped Decision Partner conversation on the right, without adding consultation to Architect's model context. After the native extension layout limitation was identified, the developer explicitly allowed a **tmux pane**. Research remains read-only, with Scout delegation; consultation does not answer or approve the pending question.

Developer requested that consultation context Markdown briefs be generated cost-efficiently: strictly lazily upon the developer explicitly deciding to chat about a question, rather than proactively for every asked question. The generated brief is ephemeral and removed when the pane closes. When the developer wants to continue the task and answer the question, typing `/return` closes the pane and returns focus to the unchanged pending question on the left, allowing the developer to submit their explicit answer and resume the governed workflow.

Developer also requested durable inspection of spawned workers: history, recorded reasoning, costs, file reads and changes. Provider-recorded reasoning and usage may be retained; unavailable reasoning or prices must not be invented. Persistence is not approval authentication or proof that recorded model claims are correct.

## Deferred scope

Harness concerns remain outside the core. The developer subsequently requested a first modular OMP plugin inside `integrations/oh-my-pi`, with strict role mapping and native option/free-text questions. For its separate Decision Partner, the developer directly chose **Sol Medium, read-only, able to spawn/contact research Scouts**. This auxiliary advisor cannot approve work or change the six-role core model. The adapter implements those technical concerns separately; it is not a core dependency. The private repository has no distribution license selected; licensing is not a dependency of this private abstraction work. Ask the owner directly if publication or distribution is proposed.
