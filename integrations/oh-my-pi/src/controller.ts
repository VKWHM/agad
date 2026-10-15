import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { append, validate } from "./core.ts";
import { askPending, isExplicitApproval } from "./dialog.ts";
import { checkpointPresentation } from "./presentation.ts";
import { fingerprint, safePath } from "./scope.ts";
import { runSession } from "./sessions.ts";
import { readTools } from "./roles.ts";
import type { Role } from "./roles.ts";
import {
  STATE_ENTRY,
  type AdapterState,
  type Json,
  type PendingQuestion,
  type Scope,
} from "./types.ts";
const humanTypes = new Set([
  "approve_contract",
  "waive_business_review",
  "provisionally_approve",
  "approve_test_gap",
  "accept",
  "cancel",
]);
export const architectTools = [
  ...readTools,
  "agad_contract",
  "agad_question",
  "agad_checkpoint",
  "agad_delegate",
  "agad_event",
  "agad_status",
  "agad_plan_tests",
];
export class Controller {
  state: AdapterState = { phase: "dialogue" };
  busy = false;
  generation = 0;
  constructor(
    readonly pi: ExtensionAPI,
    readonly provider: string,
    readonly onStateChange: () => void = () => {},
  ) {}
  publicState() {
    const { pending, ...state } = this.state;
    return {
      ...structuredClone(state),
      pending: pending
        ? {
            id: pending.id,
            question: pending.question,
            revision: pending.revision,
            candidate: pending.candidate,
            status: "awaiting_human",
          }
        : undefined,
    };
  }
  save() {
    this.pi.appendEntry(STATE_ENTRY, structuredClone(this.state));
    this.onStateChange();
  }
  restore(ctx: ExtensionContext) {
    this.generation++;
    this.state = { phase: "dialogue" };
    for (const entry of ctx.sessionManager.getBranch())
      if (entry.type === "custom" && entry.customType === STATE_ENTRY)
        this.state = structuredClone(entry.data as AdapterState);
    this.onStateChange();
  }
  async checkRecord() {
    if (this.state.record) this.state.phase = await validate(this.state.record);
    this.onStateChange();
  }
  async commit(event: Json) {
    if (!this.state.record) throw new Error("Propose a contract first");
    const generation = this.generation;
    const next = await append(this.state.record, event);
    if (generation !== this.generation)
      throw new Error("Session changed during governance operation");
    this.state.record = next.record;
    this.state.phase = next.phase;
    this.save();
  }
  current() {
    if (!this.state.record) throw new Error("No approved contract");
    const approved = [...this.state.record.events]
      .reverse()
      .find((e) => e.type === "approve_contract");
    if (!approved) throw new Error("No approved contract");
    return this.state.record.contracts.find(
      (c: Json) => c.revision === approved.revision,
    ) as Json;
  }
  candidate() {
    const event = this.state.record?.events
      .toReversed()
      .find((e: Json) => e.type === "submit_implementation");
    if (!event) throw new Error("No implementation candidate");
    return event.candidate as string;
  }
  async fresh(ctx: ExtensionContext) {
    const actual = await fingerprint(ctx.cwd, this.state.scope!.production);
    if (actual !== this.candidate())
      throw new Error(
        "Production changed after implementation. Record a repair/revision and create a new candidate; old approvals are stale.",
      );
  }
  async question(
    ctx: ExtensionContext,
    question: Omit<PendingQuestion, "id" | "consultation">,
    signal?: AbortSignal,
  ) {
    if (!ctx.hasUI)
      throw new Error("AGAD decisions require an interactive human UI");
    if (this.state.pending)
      throw new Error(
        "A question is pending. Use /agad-question to resume it.",
      );
    this.state.pending = {
      ...structuredClone(question),
      id: crypto.randomUUID(),
      consultation: [],
    };
    this.save();
    return this.resume(ctx, signal);
  }
  async resume(ctx: ExtensionContext, signal?: AbortSignal) {
    if (!ctx.hasUI) throw new Error("An interactive human UI is required");
    const pending = this.state.pending;
    const generation = this.generation;
    const current = () => {
      if (generation !== this.generation || this.state.pending !== pending)
        throw new Error("Question belongs to a different session branch");
    };
    if (!pending) throw new Error("No pending question");
    const answer = await askPending(
      pending,
      {
        ui: ctx.ui,
        current,
        save: () => {
          current();
          this.save();
        },
        partner: async (prompt, childSignal) =>
          runSession(this.pi, ctx, this.provider, {
            role: "decision_partner",
            signal: childSignal,
            prompt: JSON.stringify({
              pending_question: {
                question: pending.question,
                options: pending.options,
                context: pending.context,
              },
              approved_contract: this.state.record
                ? this.currentOrDraft()
                : null,
              consultation: pending.consultation,
              developer_request: prompt,
            }),
          }),
      },
      signal,
    );
    current();
    // Cancellation keeps question and contract context intact; no invented default.
    if (!answer) return { status: "pending", question_id: pending.id };
    if (pending.event && isExplicitApproval(answer)) {
      if (pending.event.type !== "approve_contract")
        await this.freshIfCandidate(ctx, pending.event);
      await this.commit({
        ...pending.event,
        actor: "developer",
        decision: `human:${crypto.randomUUID()}`,
        source: `omp:question:${pending.id}`,
      });
      if (pending.event.type === "approve_contract" && pending.scope)
        this.state.scope = structuredClone(pending.scope);
    }
    this.state.pending = undefined;
    this.save();
    return {
      status: "answered",
      question_id: pending.id,
      answer,
      approved: !!pending.event && isExplicitApproval(answer),
    };
  }
  currentOrDraft() {
    try {
      return this.current();
    } catch {
      return this.state.record?.contracts.at(-1);
    }
  }
  async freshIfCandidate(ctx: ExtensionContext, event: Json) {
    if (event.candidate) {
      await this.fresh(ctx);
      if (event.candidate !== this.candidate())
        throw new Error("Checkpoint refers to stale candidate");
    }
    if (event.type === "accept") {
      if (
        !this.state.verification ||
        (await fingerprint(ctx.cwd, this.state.scope!.tests)) !==
          this.state.verification.tests
      )
        throw new Error(
          "Test artifacts changed after verification; request a test correction and rerun checks",
        );
    }
  }
  async checkpoint(
    ctx: ExtensionContext,
    event: Json,
    signal?: AbortSignal,
    scope?: Scope,
  ) {
    if (event.type === "approve_contract" && !scope)
      throw new Error("Use agad_contract for a scope-bound contract approval");
    if (!humanTypes.has(event.type))
      throw new Error("Not a supported human checkpoint");
    if (!this.state.record) throw new Error("Propose a contract first");
    // Validate before asking, then again after the human answers. Actor/source never come from the model.
    const proposed = {
      ...event,
      actor: "developer",
      decision: `proposal:${crypto.randomUUID()}`,
      source: "pending-human-ui",
    };
    if (event.type === "approve_contract") {
      // Bind exclusion declarations to the eventual checkpoint decision, not agent-written authority.
      if (
        this.state.record.contracts.some((c: Json) =>
          c.requirements.some((r: Json) => !r.in_scope),
        )
      )
        throw new Error(
          "This first adapter requires independently scoped contracts containing only in-scope requirements. Keep excluded questions in contract rationale.",
        );
    }
    await append(this.state.record, proposed);
    await this.freshIfCandidate(ctx, event);
    const payload = {
      event,
      contract: this.state.record?.contracts.find(
        (c: Json) => c.revision === event.revision,
      ),
      scope: scope ?? this.state.scope,
    };
    const presentation = checkpointPresentation(payload);
    return this.question(
      ctx,
      {
        question: presentation.title,
        options: [{ label: "Approve" }, { label: "Request changes" }],
        context: JSON.stringify(payload, null, 2),
        presentation,
        event: structuredClone(event),
        revision: event.revision,
        candidate: event.candidate,
        scope,
      },
      signal,
    );
  }
  async contract(
    ctx: ExtensionContext,
    changeId: string,
    contract: Json,
    scope: Scope,
    signal?: AbortSignal,
  ) {
    if (this.state.pending)
      throw new Error("Resolve the pending question first");
    if (this.state.record && this.state.phase !== "dialogue")
      throw new Error("Return to dialogue before amending a contract");
    if (this.state.record && this.state.record.change_id !== changeId)
      throw new Error(
        "Use a new OMP session for an independently scoped change",
      );
    if (!scope.production.length)
      throw new Error("Production scope cannot be empty");
    for (const path of [...scope.production, ...scope.tests])
      await safePath(ctx.cwd, path);
    // Production and test scope cannot overlap: test writes must preserve the candidate.
    for (const production of scope.production)
      for (const test of scope.tests) {
        const p = await safePath(ctx.cwd, production),
          t = await safePath(ctx.cwd, test);
        if (p === t || p.startsWith(t + "/") || t.startsWith(p + "/"))
          throw new Error("Production and test scopes must be disjoint");
      }
    for (const [id, argv] of Object.entries(scope.checks))
      if (
        !id.trim() ||
        !argv.length ||
        argv.some((s) => typeof s !== "string" || !s)
      )
        throw new Error("Checks need nonempty exact argv arrays");
    if (
      JSON.stringify(Object.keys(scope.checks).sort()) !==
      JSON.stringify([...contract.required_checks].sort())
    )
      throw new Error(
        "Every required check needs exactly one developer-visible command",
      );
    const record = structuredClone(
      this.state.record ?? {
        schema_version: 2,
        change_id: changeId,
        contracts: [],
        events: [],
      },
    );
    if (record.contracts.some((c: Json) => c.revision === contract.revision))
      throw new Error(
        "Contract revisions are immutable; choose a new revision",
      );
    record.contracts.push(structuredClone(contract));
    const event = {
      type: "approve_contract",
      actor: "developer",
      revision: contract.revision,
      presented_by: "architect",
      teach_back: contract.teach_back,
    };
    await append(record, {
      ...event,
      decision: "proposal",
      source: "pending-human-ui",
    });
    this.state.record = record;
    this.save();
    return this.checkpoint(ctx, event, signal, scope);
  }
  async plan(
    ctx: ExtensionContext,
    task: string,
    outcomes: string[],
    signal?: AbortSignal,
  ) {
    if (this.state.pending) throw new Error("A developer question is pending");
    const contract = this.current();
    const event = {
      type: "plan_tests",
      actor: "test_engineer",
      revision: contract.revision,
      artifact_kind: "scenario_plan",
      outcomes,
      evidence: "pending-plan",
    };
    await append(this.state.record!, event);
    const evidence = await runSession(this.pi, ctx, this.provider, {
      role: "test_engineer",
      planning: true,
      signal,
      prompt: JSON.stringify({ task, contract, outcomes }),
    });
    await this.commit({ ...event, evidence });
    return evidence;
  }
  async delegate(
    ctx: ExtensionContext,
    role: Role,
    task: string,
    signal?: AbortSignal,
  ) {
    if (this.state.pending)
      throw new Error(
        "Developer question is pending; only its Decision Partner may research",
      );
    if (role === "architect" || role === "decision_partner")
      throw new Error(
        "Architect is interactive; Decision Partner is available only through a pending question",
      );
    const phase = this.state.phase;
    const expected =
      role === "implementer"
        ? "authorized"
        : role === "business_reviewer"
          ? "implemented"
          : role === "test_engineer"
            ? "test_authorized"
            : undefined;
    if (expected && phase !== expected)
      throw new Error(`${role} requires ${expected}; found ${phase}`);
    const contract = role === "scout" ? this.currentOrDraft() : this.current();
    if (role === "business_reviewer" || role === "test_engineer")
      await this.fresh(ctx);
    const checkResults: Json[] = [];
    const runCheck = async (id: string, childSignal?: AbortSignal) => {
      const argv = this.state.scope!.checks[id];
      if (!argv)
        throw new Error("Unknown check; commands cannot be supplied by agents");
      await this.fresh(ctx);
      const testedArtifacts = await fingerprint(
        ctx.cwd,
        this.state.scope!.tests,
      );
      childSignal?.throwIfAborted();
      const process = Bun.spawn(argv, {
        cwd: ctx.cwd,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      });
      const abort = () => process.kill();
      childSignal?.addEventListener("abort", abort, { once: true });
      try {
        const [stdout, stderr, exit] = await Promise.all([
          new Response(process.stdout).text(),
          new Response(process.stderr).text(),
          process.exited,
        ]);
        childSignal?.throwIfAborted();
        await this.fresh(ctx);
        if (
          (await fingerprint(ctx.cwd, this.state.scope!.tests)) !==
          testedArtifacts
        )
          throw new Error(
            "Test artifacts changed during check execution; rerun against the final files",
          );
        const result = {
          id,
          test_fingerprint: testedArtifacts,
          status: exit === 0 ? "pass" : "fail",
          evidence: JSON.stringify({ argv, exit, stdout, stderr }),
        };
        const old = checkResults.findIndex((c) => c.id === id);
        if (old >= 0) checkResults.splice(old, 1);
        checkResults.push(result);
        return JSON.stringify(result);
      } finally {
        childSignal?.removeEventListener("abort", abort);
      }
    };
    const output = await runSession(this.pi, ctx, this.provider, {
      role,
      critical: contract?.risk === "critical",
      signal,
      scope: this.state.scope,
      runCheck,
      prompt: JSON.stringify({
        task,
        contract,
        developer_decisions:
          this.state.record?.events.filter(
            (e: Json) =>
              e.actor === "developer" && e.revision === contract?.revision,
          ) ?? [],
        business_review: this.state.record?.events
          .toReversed()
          .find(
            (e: Json) =>
              ["submit_business_review", "waive_business_review"].includes(
                e.type,
              ) && e.revision === contract?.revision,
          ),
        scope: this.state.scope,
        candidate:
          expected && role !== "implementer" ? this.candidate() : undefined,
        instruction:
          role === "scout"
            ? "Return evidence and uncertainty."
            : "Return only one JSON object with the role report event fields required by the AGAD core. Do not set actor, revision or candidate; host binds them.",
      }),
    });
    if (role === "scout") return output;
    const report: Json = JSON.parse(output);
    const verifiedTests =
      role === "test_engineer"
        ? await fingerprint(ctx.cwd, this.state.scope!.tests)
        : undefined;
    if (role === "test_engineer" && report.status === "pass") {
      if (
        checkResults.some((check) => check.test_fingerprint !== verifiedTests)
      )
        throw new Error(
          "Test artifacts changed after checks; rerun every required check on the final test files",
        );
    }
    const type = {
      implementer: "submit_implementation",
      business_reviewer: "submit_business_review",
      test_engineer: "submit_tests",
    }[role];
    const candidate =
      role === "implementer"
        ? await fingerprint(ctx.cwd, this.state.scope!.production)
        : this.candidate();
    if (role !== "implementer") await this.fresh(ctx);
    const event: Json = {
      ...report,
      type,
      actor: role,
      revision: contract!.revision,
      candidate,
    };
    if (role === "test_engineer")
      Object.assign(event, {
        checks: checkResults,
        delivery: `omp:delivery:${crypto.randomUUID()}`,
        report: `omp:report:${crypto.randomUUID()}`,
      });
    await this.commit(event);
    if (role === "test_engineer") {
      this.state.verification = {
        tests: verifiedTests!,
        delivery: event.delivery,
        report: event.report,
      };
      this.save();
    }
    return JSON.stringify(event);
  }
}
