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
  fresh?: boolean;
  runCheck?: (id: string, signal?: AbortSignal) => Promise<string>;
}
interface PersistentWorker {
  workerId: string;
  role: Exclude<Role, "architect">;
  critical: boolean;
  session: NativeAgentSession;
  sessionManager?: NativeSessionManager;
  reference: WorkerSessionReference;
  runCheck?: (id: string, signal?: AbortSignal) => Promise<string>;
}
const persistentWorkers = new Map<string, PersistentWorker>();
function workerPoolKey(parentKey: string, role: Exclude<Role, "architect">) {
  return `${parentKey}::${role}`;
}
export async function resetWorkerSessions(
  parentKey?: string,
  role?: Exclude<Role, "architect">,
) {
  for (const [key, entry] of [...persistentWorkers.entries()]) {
    if (parentKey && !key.startsWith(`${parentKey}::`)) continue;
    if (role && entry.role !== role) continue;
    persistentWorkers.delete(key);
    try {
      await entry.session.dispose();
    } catch {}
  }
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
  const { createAgentSession, SessionManager, Settings, AgentRegistry } = pi.pi;
  // Implementer, Test Engineer and Business Reviewer deliberately have OMP's
  // full native tool set (shell, edit, write, web search, delegation, LSP, MCP,
  // IRC, skills, rules, context files) and stay alive across follow-up turns
  // unless `fresh: true` is requested. Early test planning, Scout and Decision
  // Partner stay ephemeral and on explicit allowlists.
  const unrestricted =
    !request.planning &&
    (role === "implementer" ||
      role === "test_engineer" ||
      role === "business_reviewer");
  const parentSessionDir =
    parentSessionManager?.getSessionDir?.() ??
    ctx.sessionManager?.getSessionDir?.() ??
    join(ctx.cwd, ".omp", "sessions");
  const parentSessionFile =
    parentSessionManager?.getSessionFile?.() ??
    ctx.sessionManager?.getSessionFile?.();
  const poolKey = unrestricted
    ? workerPoolKey(parentSessionFile ?? parentSessionDir, role)
    : undefined;
  if (poolKey && request.fresh) await resetWorkerSessions(parentSessionFile ?? parentSessionDir, role);
  const existing = poolKey ? persistentWorkers.get(poolKey) : undefined;
  if (existing && existing.critical !== critical) {
    await resetWorkerSessions(parentSessionFile ?? parentSessionDir, role);
  }
  const reusable = poolKey ? persistentWorkers.get(poolKey) : undefined;
  if (reusable) {
    reusable.runCheck = request.runCheck;
    const { session, sessionManager, reference, workerId } = reusable;
    const appendParentReference = (status: WorkerStatus) => {
      const entry = { ...reference, status };
      pi.appendEntry(AGAD_WORKER_ENTRY, entry);
      if (parentSessionManager)
        parentSessionManager.appendCustomEntry(AGAD_WORKER_ENTRY, entry);
    };
    const appendStatus = (status: WorkerStatus) => {
      const entry = { ...reference, status };
      appendParentReference(status);
      sessionManager?.appendCustomEntry?.(AGAD_WORKER_ENTRY, entry);
    };
    const abort = () => void session.abort();
    signal?.addEventListener("abort", abort, { once: true });
    try {
      appendStatus("running");
      AgentRegistry?.global?.()?.setStatus?.(workerId, "running");
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
      AgentRegistry?.global?.()?.setStatus?.(workerId, "idle");
      return result;
    } catch (error) {
      const lastAssistant = session.messages
        .slice()
        .reverse()
        .find((message) => message.role === "assistant");
      appendStatus(
        signal?.aborted || lastAssistant?.stopReason === "aborted"
          ? "aborted"
          : "error",
      );
      AgentRegistry?.global?.()?.setStatus?.(workerId, "idle");
      throw error;
    } finally {
      signal?.removeEventListener("abort", abort);
    }
  }

  const workerId = unrestricted
    ? `agad-${role.replaceAll("_", "-")}`
    : `agad-${role}-${crypto.randomUUID()}`;
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
  let session: NativeAgentSession | undefined,
    completed = false,
    retained = false;
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
    let workerHolder: PersistentWorker | undefined;
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
                  sessionManager as NativeSessionManager,
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
          const activeRunCheck = workerHolder?.runCheck ?? request.runCheck!;
          return {
            content: [
              {
                type: "text",
                text: await activeRunCheck(
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
    const promptText =
      (await rolePrompt(role)) +
      (request.planning
        ? "\nThis invocation is early scenario planning only. Do not write or execute tests. Return a plain-text plan derived only from the approved outcomes."
        : "");
    const settingsOverrides = {
      "retry.enabled": false,
      "retry.fallbackChains": {},
      ...(unrestricted ? {} : { "compaction.enabled": false }),
    };
    const settings =
      unrestricted && Settings.current
        ? (await Settings.current).overlay(settingsOverrides)
        : Settings.isolated(settingsOverrides);
    const created = await createAgentSession({
      cwd: ctx.cwd,
      authStorage: ctx.modelRegistry.authStorage,
      modelRegistry: ctx.modelRegistry,
      model,
      thinkingLevel: selected.effort,
      thinkingLevelCeiling: selected.effort,
      ...(unrestricted
        ? {
            appendSystemPrompt: promptText,
            enableMCP: true,
            enableIrc: true,
            enableLsp: true,
            spawns: "*",
            taskDepth: 1,
          }
        : {
            systemPrompt: promptText,
            toolNames: allowed,
            restrictToolNames: true,
            allowRestrictedCustomTools: true,
            enableMCP: false,
            enableIrc: false,
            enableLsp: false,
            skills: [],
            rules: [],
            contextFiles: [],
            slashCommands: [],
            promptTemplates: [],
            skipPythonPreflight: true,
          }),
      sessionManager: sessionManager as NativeSessionManager,
      settings,
      customTools,
      disableExtensionDiscovery: true,
      autoTitle: false,
      cacheWarming: false,
      bindProcessState: false,
      agentName: `agad-${role.replaceAll("_", "-")}`,
      agentId: workerId,
      parentAgentId,
      extensions: [
        (api) => {
          api.on("before_provider_request", (_event, child) => {
            if (
              child.agent &&
              (child.agent.id !== workerId || child.agent.name === "advisor")
            )
              return;
            guardIdentity(
              child,
              api.getThinkingLevel(),
              provider,
              role,
              critical,
            );
          });
          api.on("before_subagent_spawn", () =>
            unrestricted
              ? undefined
              : {
                  block: true,
                  reason: "Use only the explicit AGAD research delegation path.",
                },
          );
          api.on("tool_call", async (event) => {
            if (unrestricted) return;
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
      if (poolKey) {
        workerHolder = {
          workerId,
          role,
          critical,
          session,
          sessionManager: sessionManager as NativeSessionManager,
          reference,
          runCheck: request.runCheck,
        };
        persistentWorkers.set(poolKey, workerHolder);
        retained = true;
      }
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
      AgentRegistry?.global?.()?.setStatus?.(workerId, "idle");
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
    if (retained) AgentRegistry?.global?.()?.setStatus?.(workerId, "idle");
    throw error;
  } finally {
    if (!retained) {
      try {
        if (session) await session.dispose();
        else await sessionManager?.close?.();
      } catch (error) {
        if (completed) appendStatus("error");
        throw error;
      }
    }
  }
}
