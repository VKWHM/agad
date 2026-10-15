import { guardIdentity } from "./roles.ts";
import { Effort } from "@oh-my-pi/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { Controller, architectTools } from "./controller.ts";
import { assertIdentity, resolveModel, type Role } from "./roles.ts";
import { rolePrompt } from "./prompts.ts";
import type { Json, Scope } from "./types.ts";

export default function agad(pi: ExtensionAPI) {
  const provider = process.env.AGAD_OMP_PROVIDER ?? "openai-codex";
  const controller = new Controller(pi, provider);
  const z = pi.zod;
  const result = (value: unknown) => ({
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value),
      },
    ],
    details: {},
  });
  async function exclusive<T>(fn: () => Promise<T>) {
    if (controller.busy) throw new Error("An AGAD operation is already active");
    controller.busy = true;
    try {
      return await fn();
    } finally {
      controller.busy = false;
    }
  }
  async function bind(ctx: ExtensionContext) {
    controller.restore(ctx);
    await controller.checkRecord();
    const model = await resolveModel(ctx, provider, "architect");
    if (!(await pi.setModel(model)))
      throw new Error("Cannot activate Architect model");
    pi.setThinkingLevel(Effort.High);
    await pi.setActiveTools(architectTools);
    ctx.ui.setStatus(
      "agad",
      `AGAD ${controller.state.phase}${controller.state.pending ? " · question pending" : ""}`,
    );
  }
  pi.on("session_before_switch", () =>
    controller.busy ? { cancel: true } : undefined,
  );
  pi.on("session_before_branch", () =>
    controller.busy ? { cancel: true } : undefined,
  );
  pi.on("session_before_tree", () =>
    controller.busy ? { cancel: true } : undefined,
  );
  pi.on("session_start", async (_event, ctx) => {
    await bind(ctx);
  });
  pi.on("session_switch", async (_e, ctx) => {
    await bind(ctx);
  });
  pi.on("session_branch", async (_e, ctx) => {
    await bind(ctx);
  });
  pi.on("session_tree", async (_e, ctx) => {
    await bind(ctx);
  });
  pi.on("before_agent_start", async (event, ctx) => {
    guardIdentity(ctx, pi.getThinkingLevel(), provider, "architect");
    await pi.setActiveTools(architectTools);
    const prompt = await rolePrompt("architect");
    return {
      systemPrompt: event.systemPrompt.includes(prompt)
        ? event.systemPrompt
        : [...event.systemPrompt, prompt],
    };
  });
  pi.on("before_provider_request", (_event, ctx) => {
    guardIdentity(ctx, pi.getThinkingLevel(), provider, "architect");
  });
  pi.on("before_subagent_spawn", () => ({
    block: true,
    reason:
      "Native task/eval delegation is disabled in AGAD mode; use agad_delegate with strict mapping and gates.",
  }));
  pi.on("tool_call", (event, ctx) => {
    try {
      assertIdentity(ctx.model, pi.getThinkingLevel(), provider, "architect");
    } catch (e) {
      return { block: true, reason: String(e) };
    }
    if (!architectTools.includes(event.toolName))
      return {
        block: true,
        reason: "Architect is read-only and must use governed AGAD tools.",
      };
    if (controller.state.pending && event.toolName !== "agad_status")
      return {
        block: true,
        reason:
          "A developer question is pending. Resume with /agad-question; no dependent work may continue.",
      };
  });
  pi.registerTool({
    name: "agad_status",
    label: "AGAD status",
    description:
      "Inspect the current contract, phase, scope and pending developer question.",
    approval: "read",
    parameters: z.object({}),
    async execute() {
      return result(controller.publicState());
    },
  });
  pi.registerTool({
    name: "agad_contract",
    label: "Propose Living Domain Contract",
    description:
      "Present a complete versioned core contract and exact role scopes/check argv for explicit developer approval. Contract JSON includes teach_back. No execution is authorized until approved.",
    approval: "read",
    parameters: z.object({
      change_id: z.string(),
      contract_json: z.string(),
      scope_json: z.string(),
    }),
    async execute(_id, args, signal, _update, ctx) {
      return exclusive(async () =>
        result(
          await controller.contract(
            ctx,
            (args as { change_id: string }).change_id,
            JSON.parse((args as { contract_json: string }).contract_json),
            JSON.parse((args as { scope_json: string }).scope_json) as Scope,
            signal,
          ),
        ),
      );
    },
  });
  pi.registerTool({
    name: "agad_question",
    label: "Ask developer",
    description:
      "Ask one concrete question with 2–5 options. Native free text and Chat about this are available. Consultation stays private; only the final human answer returns to Architect.",
    approval: "read",
    parameters: z.object({
      question: z.string(),
      options: z.array(z.string()),
      context: z.string(),
    }),
    async execute(_id, args, signal, _update, ctx) {
      return exclusive(async () => {
        const input = args as {
          question: string;
          options: string[];
          context: string;
        };
        if (
          input.options.length < 2 ||
          input.options.length > 5 ||
          new Set(input.options).size !== input.options.length ||
          input.options.some((o) => !o.trim())
        )
          throw new Error("Provide 2–5 distinct nonempty choices");
        return result(
          await controller.question(
            ctx,
            {
              question: input.question,
              options: input.options.map((label) => ({ label })),
              context: input.context,
              revision: controller.currentOrDraft()?.revision,
            },
            signal,
          ),
        );
      });
    },
  });
  pi.registerTool({
    name: "agad_checkpoint",
    label: "Developer checkpoint",
    description:
      "Propose a core human checkpoint event. Actor, decision and statement source are supplied only by the human UI. Supports provisional approval, exact trivial waiver, test gap, acceptance and cancellation.",
    approval: "read",
    parameters: z.object({ event_json: z.string() }),
    async execute(_id, args, signal, _update, ctx) {
      return exclusive(async () =>
        result(
          await controller.checkpoint(
            ctx,
            JSON.parse((args as { event_json: string }).event_json),
            signal,
          ),
        ),
      );
    },
  });
  pi.registerTool({
    name: "agad_plan_tests",
    label: "Plan tests early",
    description:
      "Read-only Test Engineer scenario planning against approved outcomes. Does not write or execute tests or authorize testing.",
    approval: "read",
    parameters: z.object({ task: z.string(), outcomes: z.array(z.string()) }),
    async execute(_id, args, signal, _update, ctx) {
      const input = args as { task: string; outcomes: string[] };
      return exclusive(async () =>
        result(await controller.plan(ctx, input.task, input.outcomes, signal)),
      );
    },
  });
  pi.registerTool({
    name: "agad_delegate",
    label: "Delegate governed task",
    description:
      "Run scout, implementer, business_reviewer or test_engineer on the exact assigned model/effort. Core gates, approved write scopes, candidate fingerprints and required checks are enforced.",
    approval: "exec",
    parameters: z.object({
      role: z.enum([
        "scout",
        "implementer",
        "business_reviewer",
        "test_engineer",
      ]),
      task: z.string(),
    }),
    async execute(_id, args, signal, _update, ctx) {
      return exclusive(async () =>
        result(
          await controller.delegate(
            ctx,
            (args as { role: Role }).role,
            (args as { task: string }).task,
            signal,
          ),
        ),
      );
    },
  });
  pi.registerTool({
    name: "agad_event",
    label: "Record Architect coordination",
    description:
      "Record only an Architect control event: revise, request_repair, request_test_correction, block, resume. Never supplies human or worker reports.",
    approval: "read",
    parameters: z.object({ event_json: z.string() }),
    async execute(_id, args) {
      return exclusive(async () => {
        const event: Json = JSON.parse(
          (args as { event_json: string }).event_json,
        );
        if (
          ![
            "revise",
            "request_repair",
            "request_test_correction",
            "block",
            "resume",
          ].includes(event.type)
        )
          throw new Error("Not an Architect control event");
        await controller.commit({ ...event, actor: "architect" });
        return result({ phase: controller.state.phase });
      });
    },
  });
  pi.registerCommand("agad-status", {
    description: "Show AGAD state without starting a model turn",
    handler: async (_args, ctx) => {
      ctx.ui.notify(JSON.stringify(controller.state, null, 2), "info");
    },
  });
  pi.registerCommand("agad-question", {
    description:
      "Resume the unchanged pending Architect question, with Decision Partner consultation",
    handler: async (_args, ctx) => {
      const answer = await exclusive(() => controller.resume(ctx));
      if (answer.status === "answered")
        pi.sendMessage(
          {
            customType: "agad.human-answer",
            content: JSON.stringify(answer),
            display: true,
          },
          { triggerTurn: true },
        );
    },
  });
}
