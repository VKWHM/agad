import { join } from "node:path";
import type {
  AgentSession as NativeAgentSession,
  ExtensionAPI,
  ExtensionContext,
  CustomTool,
  SessionManager as NativeSessionManager,
} from "@oh-my-pi/pi-coding-agent";
import {
  assertIdentity,
  guardIdentity,
  profile,
  readTools,
  resolveModel,
  type Role,
} from "./roles.ts";
import { rolePrompt } from "./prompts.ts";
import { allowWrite } from "./scope.ts";
import type { Scope } from "./types.ts";
import {
  AGAD_WORKER_ENTRY,
  type WorkerSessionReference,
  type WorkerStatus,
} from "./worker-history.ts";
export interface SessionRequest {
  role: Exclude<Role, "architect">;
  prompt: string;
  critical?: boolean;
  signal?: AbortSignal;
  scope?: Scope;
  planning?: boolean;
  runCheck?: (id: string, signal?: AbortSignal) => Promise<string>;
}
export async function runSession(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  provider: string,
  request: SessionRequest,
): Promise<string> {
  return runSessionWithParent(pi, ctx, provider, request);
}
async function runSessionWithParent(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  provider: string,
  request: SessionRequest,
  parentSessionManager?: NativeSessionManager,
  parentAgentId = ctx.agent?.id ?? "parent",
): Promise<string> {
  const { role, critical = false, signal } = request,
    selected = profile(role, critical);
  const { createAgentSession, SessionManager, Settings } = pi.pi;
  const workerId = `agad-${role}-${crypto.randomUUID()}`;
  const parentSessionDir =
    parentSessionManager?.getSessionDir?.() ??
    ctx.sessionManager?.getSessionDir?.() ??
    join(ctx.cwd, ".omp", "sessions");
  const sessionManager =
    SessionManager.create
      ? SessionManager.create(ctx.cwd, parentSessionDir)
      : (SessionManager.inMemory ? SessionManager.inMemory() : ctx.sessionManager);
  const sessionId =
    sessionManager?.getSessionId?.() ?? `worker-${crypto.randomUUID()}`;
  const sessionFile =
    sessionManager?.getSessionFile?.() ??
    join(parentSessionDir, `${sessionId}.jsonl`);
  const workerName = `AGAD ${role.replaceAll("_", " ")} (${sessionId})`;
  if (!sessionFile)
    throw new Error("OMP did not allocate a file for the AGAD worker session");
  const parentSessionFile =
    parentSessionManager?.getSessionFile?.() ?? ctx.sessionManager?.getSessionFile?.();
  const reference: WorkerSessionReference = {
    workerId,
    role,
    sessionId,
    sessionFile,
    parentAgentId,
    ...(parentSessionFile ? { parentSessionFile } : {}),
    status: "running",
  };
  const appendParentReference = (status: WorkerStatus) => {
    const entry = { ...reference, status };
    pi.appendEntry(AGAD_WORKER_ENTRY, entry);
    if (parentSessionManager)
      parentSessionManager.appendCustomEntry(AGAD_WORKER_ENTRY, entry);
  };
  let session: NativeAgentSession | undefined, completed = false;
  const appendStatus = (status: WorkerStatus) => {
    const entry = { ...reference, status };
    appendParentReference(status);
    sessionManager?.appendCustomEntry?.(AGAD_WORKER_ENTRY, entry);
  };
  try {
    appendStatus("running");
    await sessionManager?.ensureOnDisk?.();
    const model = await resolveModel(ctx, provider, role, critical);
    const customTools: CustomTool[] = [];
    if (role === "decision_partner")
      customTools.push({
        name: "agad_research",
        label: "Research Scout",
        description:
          "Delegate a read-only repository or web research question to a Luna Low Scout. Return sources and uncertainty. No other delegation is available.",
        approval: "read",
        parameters: pi.zod.object({ question: pi.zod.string() }),
        async execute(_id, args, _onUpdate, _ctx, childSignal) {
          if (
            !args ||
            typeof args !== "object" ||
            !("question" in args) ||
            typeof args.question !== "string"
          )
            throw new Error("Research requires one question");
          return {
            content: [
              {
                type: "text",
                text: await runSessionWithParent(
                  pi,
                  ctx,
                  provider,
                  {
                    role: "scout",
                    prompt: args.question,
                    signal: childSignal ?? signal,
                  },
                  sessionManager,
                  workerId,
                ),
              },
            ],
            details: {},
          };
        },
      });
    if (role === "test_engineer" && !request.planning && request.runCheck)
      customTools.push({
        name: "agad_run_check",
        label: "Run approved check",
        description:
          "Execute one exact developer-approved check ID; cannot supply a command.",
        approval: "exec",
        parameters: pi.zod.object({ id: pi.zod.string() }),
        async execute(_id, args, _onUpdate, _ctx, childSignal) {
          if (
            !args ||
            typeof args !== "object" ||
            !("id" in args) ||
            typeof args.id !== "string"
          )
            throw new Error("Check execution requires one check ID");
          return {
            content: [
              {
                type: "text",
                text: await request.runCheck!(
                  args.id,
                  childSignal ?? signal,
                ),
              },
            ],
            details: {},
          };
        },
      });
    const writes = request.planning
      ? undefined
      : role === "implementer"
        ? request.scope?.production
        : role === "test_engineer"
          ? request.scope?.tests
          : undefined;
    const allowed = [
      ...readTools,
      ...(writes?.length ? ["edit", "write"] : []),
      ...customTools.map((t) => t.name),
    ];
    const created = await createAgentSession({
      cwd: ctx.cwd,
      authStorage: ctx.modelRegistry.authStorage,
      modelRegistry: ctx.modelRegistry,
      model,
      thinkingLevel: selected.effort,
      thinkingLevelCeiling: selected.effort,
      systemPrompt:
        (await rolePrompt(role)) +
        (request.planning
          ? "\nThis invocation is early scenario planning only. Do not write or execute tests. Return a plain-text plan derived only from the approved outcomes."
          : ""),
      sessionManager,
      settings: Settings.isolated({
        "retry.enabled": false,
        "retry.fallbackChains": {},
        "compaction.enabled": false,
      }),
      toolNames: allowed,
      restrictToolNames: true,
      allowRestrictedCustomTools: true,
      customTools,
      disableExtensionDiscovery: true,
      enableMCP: false,
      enableIrc: false,
      enableLsp: false,
      skills: [],
      rules: [],
      contextFiles: [],
      slashCommands: [],
      promptTemplates: [],
      autoTitle: false,
      cacheWarming: false,
      bindProcessState: false,
      skipPythonPreflight: true,
      agentName: `agad-${role.replaceAll("_", "-")}`,
      agentId: workerId,
      parentAgentId,
      extensions: [
        (api) => {
          api.on("before_provider_request", (_event, child) => {
            guardIdentity(
              child,
              api.getThinkingLevel(),
              provider,
              role,
              critical,
            );
          });
          api.on("before_subagent_spawn", () => ({
            block: true,
            reason: "Use only the explicit AGAD research delegation path.",
          }));
          api.on("tool_call", async (event) => {
            if (!allowed.includes(event.toolName))
              return { block: true, reason: "Tool outside role allowlist" };
            if (event.toolName === "edit" || event.toolName === "write") {
              try {
                // OMP hashline, patch and replace edits all expose path; multi-path/unknown dialects fail closed.
                const input = event.input;
                const path =
                  input && typeof input === "object" && "path" in input
                    ? input.path
                    : undefined;
                await allowWrite(ctx.cwd, path, writes ?? []);
              } catch (e) {
                return { block: true, reason: String(e) };
              }
            }
          });
        },
      ],
    });
    session = created.session;
    await session.setSessionName?.(workerName, "user");
    const abort = () => void session?.abort();
    signal?.addEventListener("abort", abort, { once: true });
    try {
      if (created.modelFallbackMessage)
        throw new Error(
          `Strict mapping refused fallback: ${created.modelFallbackMessage}`,
        );
      assertIdentity(
        session.model,
        session.thinkingLevel,
        provider,
        role,
        critical,
      );
      signal?.throwIfAborted();
      await session.prompt(request.prompt);
      signal?.throwIfAborted();
      assertIdentity(
        session.model,
        session.thinkingLevel,
        provider,
        role,
        critical,
      );
      const last = [...session.messages]
        .reverse()
        .find((m) => m.role === "assistant");
      if (
        !last ||
        last.role !== "assistant" ||
        last.stopReason === "error" ||
        last.stopReason === "aborted"
      )
        throw new Error("Role did not return a successful response");
      const result = last.content
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("\n");
      appendStatus("success");
      completed = true;
      return result;
    } finally {
      signal?.removeEventListener("abort", abort);
    }
  } catch (error) {
    const lastAssistant = session?.messages
      .slice()
      .reverse()
      .find((message) => message.role === "assistant");
    appendStatus(
      signal?.aborted || lastAssistant?.stopReason === "aborted"
        ? "aborted"
        : "error",
    );
    throw error;
  } finally {
    try {
      if (session) await session.dispose();
      else await sessionManager?.close?.();
    } catch (error) {
      if (completed) appendStatus("error");
      throw error;
    }
  }
}
