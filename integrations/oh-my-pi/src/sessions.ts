import type {
  ExtensionAPI,
  ExtensionContext,
  CustomTool,
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
  const { role, critical = false, signal } = request,
    selected = profile(role, critical);
  const model = await resolveModel(ctx, provider, role, critical);
  const { createAgentSession, SessionManager, Settings } = pi.pi;
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
        const result = await runSession(pi, ctx, provider, {
          role: "scout",
          prompt: (args as { question: string }).question,
          signal: childSignal ?? signal,
        });
        return { content: [{ type: "text", text: result }], details: {} };
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
        return {
          content: [
            {
              type: "text",
              text: await request.runCheck!(
                (args as { id: string }).id,
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
  const { session, modelFallbackMessage } = await createAgentSession({
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
    sessionManager: SessionManager.inMemory(),
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
    agentId: `agad-${role}-${crypto.randomUUID()}`,
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
              await allowWrite(
                ctx.cwd,
                (event.input as Record<string, unknown>).path,
                writes ?? [],
              );
            } catch (e) {
              return { block: true, reason: String(e) };
            }
          }
        });
      },
    ],
  });
  const abort = () => void session.abort();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    if (modelFallbackMessage)
      throw new Error(
        `Strict mapping refused fallback: ${modelFallbackMessage}`,
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
    return last.content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n");
  } finally {
    signal?.removeEventListener("abort", abort);
    await session.dispose();
  }
}
