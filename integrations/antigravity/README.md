# AGAD for Antigravity CLI

Native **Markdown custom agents** for Antigravity CLI (`agy`). This is an instruction-guided integration like AGAD's Codex adapter: **natural Markdown handoffs**, no enforced JSON envelopes, no second governance engine, no fabricated human approvals.

## Install and start

From the AGAD checkout, install into an existing project (the installer refuses to overwrite different agent files or an existing root `AGENTS.md`):

```sh
bash integrations/antigravity/scripts/install.sh /path/to/project
cd /path/to/project
agy --agent agad-architect --model gemini-4-argon-high
```

Or use `bash /path/to/agad/integrations/antigravity/scripts/launch.sh architect` **from the target project directory** after installation. `launch.sh` also supports `implementer`, `business-reviewer`, `test-engineer` and `scout` for individual direct sessions. In an existing project, **merge** `integrations/antigravity/AGENTS.md` into its current `AGENTS.md` yourself; the installer does not replace it.

Open `/agents` to inspect available agents. The `agad-architect` main agent can delegate via `invoke_subagent` as appropriate. Do not invoke Test Engineer to write/run tests before the Developer's provisional approval; independent early **scenario planning only** is allowed.

## Requested model preferences

| Role | Desired direct-session model | Custom-subagent `model` field |
| --- | --- | --- |
| Architect (primary) | `gemini-4-argon-high` | `inherit` |
| Implementer | `gemini-3.8-flash-high` | `flash` |
| Business Reviewer | `gemini-3.8-flash-high` | `flash` |
| Test Engineer | `gemini-3.8-flash-medium` | `flash` |
| Scout | `gemini-3.8-flash-low` | `flash` |
| Decision Partner (advisory) | Unspecified; inherits invoker's model | `inherit` |

We interpreted "Gemini Argon 4" as **Gemini 4 Argon High**, "Gemini 3.8 High" as **Gemini 3.8 Flash High**, and the final "Gemini 3.8 Flash Low for secret" as **Scout**. The multiple Test Engineer references were resolved using the last explicit model: **Gemini 3.8 Flash Medium**.

**Important Antigravity limitation:** As of the documented CLI custom-agent schema (October 2026), nested agents only accept `model: inherit|flash|pro`, not exact model IDs or per-role thinking levels. A `flash` subagent **is not guaranteed to run** at the High/Medium/Low effort in the table. To pin models exactly, launch each role as its own interactive/main session using `scripts/launch.sh <role>` and manually carry over the natural-language handoff. This is not transparent delegated-agent pinning. The profiles require account/model availability (check `agy models`); the scripts deliberately do not silently substitute an unavailable model.

## Human-led workflow

1. **Dialogue:** Developer ↔ Architect clarifies outcomes and domain vocabulary, including unresolved business questions. Scout may research only.
2. **Contract:** Architect teaches back intent; Developer explicitly approves a versioned Living Domain Contract (requirements, boundaries, invariants, scope and checks).
3. **Implementation:** Implementer makes the smallest complete change allowed by the contract, verifies locally and returns a Markdown candidate report.
4. **Business review:** Reviewer derives scenarios from the contract **before** inspecting code. Developer resolves findings. Only the Developer can grant a candidate-specific trivial waiver.
5. **Provisional approval:** Developer approves exact candidate **for testing**.
6. **Independent tests:** Test Engineer writes and runs tests on approved outcomes, reporting real results and gaps; no production edits.
7. **Code review and acceptance:** Developer reviews actual diff and evidence, then explicitly accepts or requests a repair/revision.

Technical repairs produce a fresh candidate and repeat downstream review/approval. Changed business intent requires a fresh contract. A failed test doesn't authorize its own expected behavior.

### Natural-language handoff example

```md
**Change:** checkout-27 · **Contract:** rev 3 (developer approved)
**From → to:** Architect → Implementer
**Outcomes:** R1, R2
**Scope:** src/checkout/** (production); tests only by Test Engineer
**Evidence:** Existing checkout adapter in src/checkout/adapter.ts
**Stop if:** Customer authentication or payment capture semantics are unclear
**Return:** changed files, candidate commit/diff, checks actually run, deviations, risks
```

For a candidate report, include `rev 3`, immutable commit/diff reference, outcome mapping, actual commands/results, and unverified conditions. Human approval is an explicit conversational decision with its source; an agent's summary cannot stand in for it.

## Capabilities and limits

These custom agents provide **role instructions and native tool exposure**, not enforceable filesystem scopes, identity verification, role-isolated approval state, or automatic state-transition checks. Native Antigravity permission prompts and sandboxing are additional safety controls, **not** AGAD domain approvals. Avoid broad `--dangerously-skip-permissions` settings when using financial or production repositories.

The source of truth remains AGAD's [core workflow](../../docs/workflow.md), [role contracts](../../docs/roles.md), and [handoffs](../../docs/handoffs.md). Model and tool configuration stays here, outside the harness-independent core.

References: [Antigravity custom agents](https://www.agy.dev/docs/subagents/), [Antigravity CLI model flags](https://www.agy.dev/docs/cli/headless/), [Antigravity workspace rules](https://www.agy.dev/docs/rules/).

## Checks

```sh
python3 -m unittest discover -s integrations/antigravity/tests -v
python3 -m unittest discover -s tests -v
python3 tools/validate.py examples/accepted.json
```

Run an interactive `agy` smoke test on an authenticated, supported host; these static tests do **not** establish effective subagent model selection or governance enforcement.
