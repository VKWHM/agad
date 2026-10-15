# AGAD for Oh My Pi

An experimental OMP-native plugin, isolated from the [harness-independent core](../../README.md). Targets **OMP 18.10.4**, Bun and Python 3.10+. Keep this directory inside the AGAD checkout: the Python bridge calls the unchanged core validator in `../../tools/validate.py`.

## Start

From this directory:

```sh
bun install --frozen-lockfile
bun scripts/check-models.ts
omp --no-extensions --no-prewalk --no-title --extension "$PWD" --cwd /absolute/path/to/your/project
```

This explicit launch loads AGAD for that session. It does not install a global plugin or modify your global model assignments. `AGAD_OMP_PROVIDER` defaults to `openai-codex`; a different provider may be selected only if its registry exposes the same exact model IDs and efforts. Missing access blocks execution rather than substituting a model.

Ask the Architect for one small change. It teaches back the intended outcomes, proposes a versioned Living Domain Contract, and asks for your approval of the contract, disjoint production/test paths and exact test-command argument arrays. The Architect is read-only and delegates through governed tools.

## Live AGAD panel

AGAD uses a compact native widget **above the editor**, leaving OMP's editor and footer unchanged. It replaces the old AGAD footer status label. The panel shows the workflow phase, contract revision when available (pending question revision, otherwise the latest proposed revision), and a next-step hint. Pending questions advertise `/agad-question`; dialogue invites discussion with Architect, and other phases point to Architect guidance and `/agad-status`.

The two short text rows use OMP's native word wrapping at narrow widths. No question text or context, consultation transcript, candidate fingerprint or approval payload is placed in the panel, so long questions do not expand it. Presentation is derived from the controller's existing state at save, restore and record-validation boundaries, and rebound on session start/switch/branch/tree; there is no polling or second persisted state.

## Strict role mapping

| Role | Model ID | Effort | Capabilities |
| --- | --- | --- | --- |
| Architect | `gpt-6.1-sol` | high | Interactive coordination, read/research, governed handoffs |
| Implementer | `gpt-6.1-sol` | medium | Read/research; edit/write approved production paths |
| Business Reviewer | `gpt-6.1-sol` | medium; high for critical contracts | Read/research; business scenario discovery |
| Test Engineer | `gpt-6-luna` | high | Early read-only planning; after approval, approved test paths and exact check IDs |
| Scout | `gpt-6-luna` | low | Read-only repository/web research; no delegation |
| Decision Partner | `gpt-6.1-sol` | medium | Read-only discussion/research; may spawn only research Scouts |

The Developer is the human authority, not another model. Role definitions live in [agents](agents/); [roles.ts](src/roles.ts) is the enforced model/effort map. No fuzzy selectors, role aliases, prewalk switches, SDK fallback or automatic retry fallback are used in helper sessions. The Architect is checked before every provider request and tool call. Identity mismatch explicitly aborts the session because OMP isolates hook exceptions; a manual model/effort change outside its mapping stops AGAD execution. Generic native `task`/`eval` delegation is blocked so it cannot bypass the adapter.

## Think with a partner while a question stays open

1. Architect presents the native OMP question with its original answer options. You may choose an option or type your own answer.
2. Select **Chat about this — Decision Partner**, an explicit AGAD action in both rich questions and fallback selectors. It does not depend on a host-native chat row; native `kind: "chat"` results remain supported. If an original option already uses the action label, only AGAD's action receives a numeric suffix.
3. When OMP is running inside tmux with tmux and Bun available, AGAD opens a real horizontal split: OMP remains on the left and a smaller 38% consultation pane opens on the right. The pane shows the unchanged question, complete context, options and saved consultation transcript, with a composer for follow-ups. Enter `/return` or close the pane to return to the same question. The transcript is saved in `pending.consultation`, so it reappears if you reopen the pane.
4. If tmux or the Bun runtime is unavailable, OMP is not running in a tmux pane, or the consultation pane cannot be started, AGAD visibly explains that no split pane is available and uses OMP's existing native consultation dialogs instead; it does not claim to have opened a split. In either UI, the same Decision Partner callback can use read-only sources/tools and `agad_research` for a strictly read-only Luna Low Scout.
5. Return to the original Architect question. Its ID, options, context, revision and candidate have not changed. Submit your answer only when ready.
6. Only that final human answer and an optional note go to Architect; consultation does not enter Architect's model history or authorize work. You can explicitly include insights in your typed answer.

```mermaid
flowchart LR
  A[Architect question stays pending] --> Q[Native options / free text]
  Q -->|Chat about this| P[Decision Partner: Sol Medium]
  P -->|Read-only research| S[Scout: Luna Low]
  S --> P
  P -->|Return| Q
  Q -->|Explicit human submission| R[Architect receives the answer]
```

Cancelling or closing the consultation pane preserves the pending question. Use `/agad-question` to resume it after interruption or reopening a saved session. `/agad-cancel` dismisses a pending question without approving, clearing the question lock. `/agad-status` shows the current state without a model turn. While a question is pending, dependent delegation is blocked. Branch/session switches are refused during an active adapter operation; late dialog responses are checked against their original session generation.

For approvals, the human must explicitly select **Approve**. Free text such as “approve after changing X,” a timeout, cancellation, the Partner's recommendation or silence is never approval. Human checkpoints use readable names (for example, **Contract approval** and **Final acceptance**) and event-specific outcome-first summaries. Contract approval explains implementation authority using the contract teach-back/intent. A business review waiver waives only reviewer review for the exact candidate, with its supplied rationale; it grants neither testing nor final acceptance. Provisional approval authorizes testing with the supplied finding dispositions, not final acceptance. Test-gap approval identifies the exact affected outcome IDs and supplied reason, impact and revisit trigger, waiving coverage only, not feature behavior, invariants or mandatory checks. Final acceptance binds the candidate, delivery and report after human code review. Cancellation stops the change rather than delivering the feature. Unknown checkpoint types explicitly leave authority unknown and direct the human to full details and Architect. Summaries include supplied revision/candidate identifiers and consequential event fields; long values may be shortened, with exact values available through Review full details. Hosts without the rich dialog receive native selection plus text-input dialogs. Human decisions require an interactive UI; headless operation fails closed.

The consultation action and its pane are presentation-only: they never become a final answer. Mixed rich-dialog selections (multiple choices, or a choice combined with custom input) cannot approve; cancellation, timeout, returning from consultation or a Partner error leaves the question pending. Closing the pane cancels an active Partner request and discards no already-saved transcript turns. No consultation message, result or pane control grants approval.

Run `python3 tests/smoke-ui.py` from this directory to exercise the real tmux pane lifecycle with a deterministic Partner fixture and no model calls. It requires installed `omp` and `tmux`.

### Review full checkpoint details

Both rich checkpoint questions and fallback selectors include **Review full details**, alongside the original answer choices and Decision Partner action. Action labels receive numeric suffixes when necessary to avoid colliding with ordinary choices or each other. No details-view gate is required before answering.

The action opens OMP's native scrollable editor with a human-readable report of the original approval payload: contract, requirements and their provenance/bounds, event identity, evidence/dispositions, separate production/test paths and exact check argv where supplied. The renderer visits every original field, including unknown additional fields, without truncating the details. Labeled objects and ordered, zero-indexed arrays retain field keys and values; strings use quoted JSON escaping to make exact whitespace, characters and argument boundaries unambiguous. Commands are not hidden, flattened into shell strings or executed by this action.

The report is stored with a new pending checkpoint as presentation only; the existing payload remains authoritative. Saved checkpoints rederive current event-specific presentation from their original context, rather than reusing a stale stored summary, without rewriting the pending question or payload. If legacy context cannot be parsed, the details retain that context as an exact labeled string alongside the stored event and any stored scope; absent data is not invented. Primary checkpoint text never falls back to raw JSON.

Closing, cancelling or editing the details editor discards its returned text and reopens the same pending question (unless the enclosing request is aborted). It cannot change the payload, resolve the question or approve anything. Session-generation and pending-question identity checks still apply, and only a subsequent explicit **Approve** retains approval authority. AGAD does not customize the native editor or footer.


## Agent handoff format

Developer selected **Markdown handoffs; validated records**. Implementer, Business Reviewer and Scout receive a Markdown task brief with separate instructions and context sections. Decision Partner receives a question-scoped Markdown brief and private conversation transcript; Scout and Partner advice is concise Markdown with sources and explicit uncertainty. Exact contract, decision, scope, candidate and option values remain compact JSON inside fenced context sections rather than being paraphrased. Embedded backticks cannot prematurely close those fences.

Authoritative implementation, business-review and test reports still use the existing JSON core event contract and reference validator. Markdown advice cannot create developer approval. Test Engineer planning, worker input/output contract and approved-check execution are unchanged. No SDK structured-output mode or new serialization dependency was added.

The research supports concise briefs, isolated context and progressive disclosure—not a universal fastest serialization. [Anthropic's production multi-agent system](https://www.anthropic.com/engineering/multi-agent-research-system) uses condensed results and artifact references; [Superpowers](https://github.com/obra/superpowers/blob/main/skills/subagent-driven-development/implementer-prompt.md) uses Markdown briefs and report files. Existing AGAD write restrictions are retained: this change does not give read-only roles artifact-write permission. [TOON's own guidance](https://github.com/toon-format/toon#when-not-to-use-toon) notes that compact JSON may win for deeply nested or non-uniform data. No AGAD token-cost or latency improvement is claimed without measurement.

## Governed development

The controller reuses the core's version-2 reference validator for every transition:

`contract approval → Implementer → Business Reviewer or exact human trivial waiver → human provisional approval → Test Engineer → human code review/final acceptance`.

Early Test Engineer planning uses `agad_plan_tests` and exposes no write or check-execution tools. A review waiver is a separate human checkpoint and does not bypass provisional approval. Technical repairs and test-only corrections follow the core's distinct paths. Stalled progress or new uncertainty must return to Developer–Architect dialogue; there is no numeric repair budget.

Production candidates are fingerprints of the approved production paths. Review, testing and candidate-specific checkpoints reject changed production. Final acceptance additionally checks that test artifacts match the verified snapshot. Actual executed check results, rather than model-written PASS claims, are supplied to the core. Every passing check is bound to the same final test-file snapshot; later test edits require rerunning all required checks. No approval is synthesized from a worker's text.

Each worker is a fresh, restricted SDK session with explicit model, effort and tools, no ambient extensions, MCP, IRC, LSP, skills, rules or inherited project context files, and no generic subprocess tool. Relevant contract/task context is supplied explicitly. Write-tool calls are checked against the role's approved path scope, including symlink/traversal checks. The Partner and Scout have neither edit/write nor shell/command tools.

Test Engineer can run only check IDs whose exact argument arrays you approved with the contract. Those programs execute with your OS permissions and are trusted developer-selected programs; this plugin is not an OS sandbox. Fingerprints protect declared production scope; production paths must cover the actual production surface of the change. Role restrictions govern exposed agent tools, not a malicious user, extension or test executable running in the same process/account.

### SDK helper callback repair and live hosts

The tools passed by `sessions.ts` to `createAgentSession` are typed as SDK `CustomTool`, whose installed execution signature is `(id, params, onUpdate, ctx, signal?)`. Both `agad_research` and `agad_run_check` take cancellation from the fifth argument, falling back to the outer request signal only when that argument is absent. Previously they treated the third argument (the streaming update callback) as an abort signal; this could fail with `childSignal?.throwIfAborted is not a function` before an approved check spawned and also affected research cancellation. Registered extension tools in `index.ts` retain their different `ToolDefinition` callback order. This repair does not change approved check IDs/argv, role permissions, models or approval authority, and does not suppress abort errors.

Live-host facts from source inspection: the parent controller imports `runSession` from `sessions.ts`; creating a fresh worker does not itself re-import that parent module. The installed extension loader uses a tagged import when loading an extension. Editing files does not replace functions already held by a running controller. Operational inference: a parent that already imported the old helper must reload the extension code before governed `runCheck` can use this repair, or restart OMP with the same extension. `/reload` has not been exercised here, and its availability and sufficiency for refreshing this host's entire imported extension graph are not established; do not assume that merely retrying a worker or restoring a session activates the fix. Restarting the host is the unambiguous way to load the edited source.


## Modules and tools

| Module | Responsibility |
| --- | --- |
| `roles.ts`, `agents/` | Exact model/effort map and role prompts |
| `dialog.ts` | Native questions, free text, consultation and explicit submission |
| `presentation.ts` | Concise checkpoint summaries and complete readable payload reports |
| `sessions.ts` | Isolated role sessions, read-only Scout delegation, role tool scopes |
| `controller.ts` | Core-gated handoffs, candidate freshness and human checkpoints |
| `scope.ts` | Path checks and production/test artifact fingerprints |
| `core.ts`, `scripts/core_bridge.py` | Transport to the existing core, without duplicating its policies |
| `index.ts` | OMP registration, lifecycle hooks, commands and parent-session guard |

Architect tools: `agad_contract`, `agad_question`, `agad_checkpoint`, `agad_delegate`, `agad_plan_tests`, `agad_event`, `agad_status`. Developer-only event authority is created inside interactive checkpoints; there is no tool accepting arbitrary developer approval records. Worker report authority comes from the specific mapped role session.

The adapter stores snapshots under the namespaced OMP custom session entry `agad.omp.state.v1`, including pending question and consultation. Resume/branch restoration replays the stored core record. Core artifact references still require meaningful human review; fingerprints and UI attribution strengthen the reference checks but do not prove business correctness.

[Example contract](examples/contract.json) and [scope/command declaration](examples/scope.json) illustrate the tool inputs for a fictional reservation change. They are examples, not approved policies for your application.

## First-version scope

Use one independently scoped change per OMP session. Contracts must include only in-scope requirement records; keep excluded scenarios and questions in the rationale or human dialogue. Scope amendments require a new contract revision. Scopes must be nonempty for production and disjoint from test paths. Reserved `.git`, `.omp`, `node_modules` paths and symlink write paths are excluded. Edit dialects without one explicit `path` are rejected; the ordinary write tool remains available within approved scope.

The adapter is local to this checkout and is not published to npm. This is a first technical implementation, not a claim that an entire production change has passed final human acceptance. Automated controller/dialog/permission tests and installed-host smoke scripts exist; their presence is not evidence that this UI change has passed them. A live model-driven coding and terminal-interaction acceptance session remains a developer responsibility.

## Validation

```sh
bun run typecheck
bun test
python3 ../../tools/validate.py ../../examples/accepted.json
python3 -m unittest discover -s ../../tests -v
python3 scripts/smoke-rpc.py
```

`check-models.ts` checks exact registry/authentication availability without prompting a model. `smoke-rpc.py` loads the installed OMP host, verifies Architect mapping and command registration, and sends no model prompt. Session unit tests use SDK doubles so they verify isolation/delegation without spending model tokens. Dialog tests cover native chat routing, cancellation, timeout, free text and question identity; they do not claim physical terminal-key testing.

For the panel, explicit consultation action, readable checkpoint/details changes and SDK helper callback prerequisite repair, no tests or checks have been run during this implementation and no test files were changed. Verification is awaiting Test Engineer: migrate SDK doubles to the actual fifth-signal callback order, add consumer-visible regression coverage, and run `typecheck`, `adapter-tests`, `host-rpc-smoke` and `terminal-ui-smoke` (including narrow-width rendering, lifecycle refresh, action-label collisions, complete details/argv rendering, legacy pending questions, view/edit/cancel returning without approval and mixed-input fail-closed behavior). Source inspection is not a passing result, and no physical-terminal acceptance is claimed here.

API references for the targeted upstream tag `v18.10.4`, commit `687892d1046ecaf18829b45f5b86928a308258f4`, are below. This UI implementation also read the installed host's widget, question/result and native text-wrapping APIs directly; source inspection is not runtime verification.

- [Extension API and tool execution signature](https://github.com/can1357/oh-my-pi/blob/v18.10.4/packages/coding-agent/src/extensibility/extensions/types.ts)
- [Native ask dialog and Chat about this result](https://github.com/can1357/oh-my-pi/blob/v18.10.4/packages/tui/src/overlays/ask-dialog.ts)
- [Restricted SDK session options](https://github.com/can1357/oh-my-pi/blob/v18.10.4/packages/coding-agent/src/sdk.ts)
- [Agent discovery and model overrides](https://github.com/can1357/oh-my-pi/blob/v18.10.4/docs/task-agent-discovery.md)
