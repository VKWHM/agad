import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { append, validate } from "./core.ts";
import { askPending, isExplicitApproval } from "./dialog.ts";
import { checkpointPresentation } from "./presentation.ts";
import { fingerprint, safePath } from "./scope.ts";
import { runSession } from "./sessions.ts";
import { markdownBrief, rolePrompt } from "./prompts.ts";
import { generateConsultationMarkdown } from "./consultation-pane.ts";
import { profile, readTools } from "./roles.ts";
import type { Role } from "./roles.ts";
import {
  STATE_ENTRY,
  type AdapterState,
  type Json,
  type PendingQuestion,
  type Scope,
} from "./types.ts";
import { normalizeContract, normalizeScope } from "./contract-normalization.ts";
import {
  bindEvent,
  explainRejection,
  extractJsonObject,
  normalizeReport,
  reportSkeletons,
  type HostFacts,
} from "./guidance.ts";
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
  "bash",
  "sh",
  "write",
  "wait",
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
  /** Facts the host already owns, used to bind events instead of trusting model-typed values. */
  facts(): HostFacts {
    const events: Json[] = this.state.record?.events ?? [];
    const approved = events.findLast((e) => e.type === "approve_contract");
    const candidate = events.findLast((e) => e.type === "submit_implementation");
    const review = events.findLast((e) => e.type === "submit_business_review");
    return {
      revision: approved?.revision,
      candidate: candidate?.candidate,
      findingCount: review?.findings?.length,
      verification: this.state.verification,
    };
  }
  explain(error: unknown, type?: string, role?: string) {
    const approved = this.facts().revision;
    const outcomes = this.state.record?.contracts
      .find((c: Json) => c.revision === approved)
      ?.requirements.filter((r: Json) => r.in_scope)
      .map((r: Json) => r.id);
    return explainRejection(error, { phase: this.state.phase, type, role, outcomes });
  }
  // Validate a would-be report event without mutating the record.
  async dryRunReport(role: Role, report: Json, contract: Json, candidate?: string, checks?: Json[]) {
    const type = { implementer: "submit_implementation", business_reviewer: "submit_business_review", test_engineer: "submit_tests" }[role as string];
    if (!type || !this.state.record) return;
    const event: Json = {
      ...report,
      type,
      actor: role,
      revision: contract.revision,
      candidate: candidate ?? (role === "implementer" ? "sha256:dry-run" : this.candidate()),
    };
    if (role === "test_engineer")
      Object.assign(event, {
        checks: checks ?? [],
        delivery: `omp:delivery:${crypto.randomUUID()}`,
        report: `omp:report:${crypto.randomUUID()}`,
      });
    await append(this.state.record, event);
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
        native: {
          model: `${this.provider}/${profile("decision_partner").id}`,
          thinking: profile("decision_partner").effort,
          systemPrompt: async () =>
            `${await rolePrompt("decision_partner")}\n\n${generateConsultationMarkdown(pending)}`,
          research: (question, childSignal) =>
            runSession(this.pi, ctx, this.provider, {
              role: "scout",
              signal: childSignal,
              prompt: question,
            }),
        },
        partner: async (prompt, childSignal) =>
          runSession(this.pi, ctx, this.provider, {
            role: "decision_partner",
            signal: childSignal,
            prompt: markdownBrief(
              prompt,
              {
                "Pending question": {
                  question: pending.question,
                  options: pending.options,
                  context: pending.context,
                },
                "Approved contract": this.state.record
                  ? this.currentOrDraft()
                  : null,
                "Private consultation": pending.consultation
                  .map((turn) => `${turn.speaker === "developer" ? "Developer" : "Decision Partner"}:\n${turn.text}`)
                  .join("\n\n"),
              },
              "Discuss the pending question in concise Markdown. Research files or the web as needed; use agad_research for read-only Scout delegation. This conversation is advisory, not an answer or approval. Keep unknown business meaning explicit.",
            ),
          }),
      },
      signal,
    );
    current();
    // Cancellation keeps question and contract context intact; no invented default.
    if (!answer) return { status: "pending", question_id: pending.id };
    if (pending.event && isExplicitApproval(answer)) {
      try {
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
      } catch (error) {
        this.state.pending = undefined;
        this.save();
        return {
          status: "answered",
          question_id: pending.id,
          answer,
          approved: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
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
  cancelPending() {
    const pending = this.state.pending;
    if (!pending) return undefined;
    this.state.pending = undefined;
    this.save();
    return pending;
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
    rawEvent: Json,
    signal?: AbortSignal,
    scope?: Scope,
  ) {
    const event =
      rawEvent.type === "approve_contract"
        ? rawEvent
        : bindEvent(rawEvent, this.facts());
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

    const normalizedScope = normalizeScope(scope);
    const normalizedContract = normalizeContract(contract, normalizedScope.checks);

    if (!normalizedScope.production.length)
      throw new Error("Production scope cannot be empty");
    for (const path of [...normalizedScope.production, ...normalizedScope.tests])
      await safePath(ctx.cwd, path);
    // Production and test scope cannot overlap: test writes must preserve the candidate.
    for (const production of normalizedScope.production)
      for (const test of normalizedScope.tests) {
        const p = await safePath(ctx.cwd, production),
          t = await safePath(ctx.cwd, test);
        if (p === t || p.startsWith(t + "/") || t.startsWith(p + "/"))
          throw new Error("Production and test scopes must be disjoint");
      }
    for (const [id, argv] of Object.entries(normalizedScope.checks))
      if (
        !id.trim() ||
        !argv.length ||
        argv.some((s) => typeof s !== "string" || !s)
      )
        throw new Error("Checks need nonempty exact argv arrays");
    if (
      JSON.stringify(Object.keys(normalizedScope.checks).sort()) !==
      JSON.stringify([...normalizedContract.required_checks].sort())
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
    if (record.contracts.some((c: Json) => c.revision === normalizedContract.revision))
      throw new Error(
        "Contract revisions are immutable; choose a new revision",
      );
    record.contracts.push(structuredClone(normalizedContract));
    const event = {
      type: "approve_contract",
      actor: "developer",
      revision: normalizedContract.revision,
      presented_by: "architect",
      teach_back: normalizedContract.teach_back,
    };
    await append(record, {
      ...event,
      decision: "proposal",
      source: "pending-human-ui",
    });
    this.state.record = record;
    this.save();
    return this.checkpoint(ctx, event, signal, normalizedScope);
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
    fresh = false,
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
    const context = {
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
    };
    const instruction =
      role === "scout"
        ? "Return concise Markdown with findings, source paths/URLs and explicit uncertainty. Do not invent business decisions."
        : `Return only one JSON object (no prose, no code fence) shaped like ${reportSkeletons[role]}. "evidence" must be a non-empty string. Do not set actor, revision, candidate, type, checks, delivery or report; host binds them.`;
    const run = (prompt: string, spawnFresh = false) =>
      runSession(this.pi, ctx, this.provider, {
        role,
        critical: contract?.risk === "critical",
        signal,
        scope: this.state.scope,
        fresh: spawnFresh,
        runCheck,
        prompt,
      });
    // Preserve the working Test Engineer's input and output contract.
    const basePrompt =
      role === "test_engineer"
        ? JSON.stringify({ task, ...context, instruction })
        : markdownBrief(task, context, instruction);
    let output = await run(basePrompt, fresh);
    if (role === "scout") return output;
    const parse = (raw: string) => normalizeReport(extractJsonObject(raw));
    let report: Json;
    try {
      report = parse(output);
      // Dry-run the report on the same live worker session so a fixable shape
      // or missing-outcomes error is corrected in one turn without losing work.
      await this.dryRunReport(role, report, contract, undefined, checkResults);
    } catch (first) {
      const reason = first instanceof Error ? first.message : String(first);
      output = await run(
        markdownBrief(
          task,
          { "Your previous reply": output.slice(0, 4000), "Why it was rejected": reason },
          `Return ONLY one corrected JSON object, shaped like ${reportSkeletons[role]}. Keep your completed work and include all required in-scope outcome IDs; do not repeat unrelated analysis.`,
        ),
        false,
      );
      report = parse(output);
    }
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
