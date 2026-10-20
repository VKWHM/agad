import { expect, test } from "bun:test";
import type {
  CreateAgentSessionOptions,
  ExtensionAPI,
  ExtensionContext,
} from "@oh-my-pi/pi-coding-agent";
import { resetWorkerSessions, runSession } from "../src/sessions.ts";
import { STATE_ENTRY, type AdapterState } from "../src/types.ts";
import { Controller } from "../src/controller.ts";
import {
  AGAD_WORKER_ENTRY,
  latestWorkerReferences,
} from "../src/worker-history.ts";
type TestCustomEntry = { type: "custom"; customType: string; data: unknown };
type TestSessionManager = {
  id: string;
  entries: TestCustomEntry[];
  sessionDir: string;
  file: string;
  materialized: boolean;
  closeCount: number;
  getSessionId(): string;
  getSessionFile(): string;
  getSessionDir(): string;
  appendCustomEntry(customType: string, data: unknown): string;
  ensureOnDisk(): Promise<void>;
  close(): Promise<void>;
};
function harness(
  research = false,
  behavior: {
    promptError?: Error;
    createError?: Error;
    modelFallbackMessage?: string;
  } = {},
) {
  const sessionOptions: CreateAgentSessionOptions[] = [],
    invocations: { role: string; prompt: string }[] = [],
    disposed: string[] = [],
    managers: TestSessionManager[] = [],
    parentEntries: TestCustomEntry[] = [],
    settingsOverrides: Readonly<Record<string, unknown>>[] = [];
  let nextSession = 0;
  const parentSessionDir = "/tmp/agad-parent-sessions",
    parentSessionFile = `${parentSessionDir}/parent.jsonl`;
  const createManager = (sessionDir: string): TestSessionManager => {
    const id = `worker-session-${++nextSession}`,
      entries: TestCustomEntry[] = [];
    const manager: TestSessionManager = {
      id,
      entries,
      sessionDir,
      file: `${sessionDir}/${id}.jsonl`,
      materialized: false,
      closeCount: 0,
      getSessionId: () => id,
      getSessionFile: () => manager.file,
      getSessionDir: () => sessionDir,
      appendCustomEntry: (customType, data) => {
        entries.push({ type: "custom", customType, data });
        return `entry-${entries.length}`;
      },
      ensureOnDisk: async () => {
        manager.materialized = true;
      },
      close: async () => {
        manager.closeCount += 1;
      },
    };
    managers.push(manager);
    return manager;
  };
  const models = {
    find: (provider: string, id: string) =>
      provider === "openai-codex"
        ? {
            provider,
            id,
            thinking: { efforts: ["low", "medium", "high"] },
          }
        : undefined,
    getApiKey: async () => "test-only",
    authStorage: {},
  };
  const pi = {
    zod: { object: (x: unknown) => x, string: () => ({}) },
    appendEntry: (customType: string, data: unknown) => {
      parentEntries.push({ type: "custom", customType, data });
    },
    pi: {
      Settings: {
        isolated: (settings: Readonly<Record<string, unknown>>) => {
          settingsOverrides.push(settings);
          return settings;
        },
      },
      SessionManager: {
        create: (_cwd: string, sessionDir?: string) =>
          createManager(sessionDir ?? parentSessionDir),
        inMemory: () => {
          throw new Error("AGAD workers must use durable sessions");
        },
      },
      createAgentSession: async (agentOptions: CreateAgentSessionOptions) => {
        sessionOptions.push(agentOptions);
        if (behavior.createError) throw behavior.createError;
        const agentName = agentOptions.agentName ?? "",
          customTools = agentOptions.customTools ?? [],
          session = {
            model: agentOptions.model,
            thinkingLevel: agentOptions.thinkingLevel,
            messages: [
              {
                role: "assistant",
                stopReason: "stop",
                content: [{ type: "text", text: "Evidence" }],
              },
            ],
            abort: async () => {},
            setSessionName: async () => true,
            dispose: async () => {
              disposed.push(agentName);
              await agentOptions.sessionManager?.close();
            },
            prompt: async (prompt: string) => {
              invocations.push({ role: agentName, prompt });
              if (behavior.promptError) throw behavior.promptError;
              const researchTool = customTools.find(
                (tool) => tool.name === "agad_research",
              );
              if (
                research &&
                agentName === "agad-decision-partner" &&
                researchTool
              )
                await researchTool.execute(
                  "research",
                  { question: "Find evidence" },
                  undefined,
                  undefined,
                  new AbortController().signal,
                );
            },
          };
        return {
          session,
          ...(behavior.modelFallbackMessage
            ? { modelFallbackMessage: behavior.modelFallbackMessage }
            : {}),
        };
      },
    },
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd: process.cwd(),
    agent: { kind: "main", id: "Main", name: "main", depth: 0 },
    modelRegistry: models,
    sessionManager: {
      getSessionDir: () => parentSessionDir,
      getSessionFile: () => parentSessionFile,
      getEntries: () => parentEntries,
    },
  } as unknown as ExtensionContext;
  return {
    pi,
    ctx,
    sessionOptions,
    invocations,
    disposed,
    managers,
    parentEntries,
    models,
    settingsOverrides,
  };
}
test("partner can delegate research only to read-only mapped Scout sessions", async () => {
  const h = harness(true);
  await runSession(h.pi, h.ctx, "openai-codex", {
    role: "decision_partner",
    prompt: "Help me critique this",
  });
  expect(h.sessionOptions.map((options) => options.agentName)).toEqual([
    "agad-decision-partner",
    "agad-scout",
  ]);
  expect(h.sessionOptions[0].model?.id).toBe("gpt-6.1-sol");
  expect(h.sessionOptions[0].thinkingLevel).toBe("medium");
  expect(h.sessionOptions[1].model?.id).toBe("gpt-6-luna");
  expect(h.sessionOptions[1].thinkingLevel).toBe("low");
  for (const [index, options] of h.sessionOptions.entries()) {
    const tools = options.toolNames ?? [];
    expect(tools).not.toContain("bash");
    expect(tools).not.toContain("write");
    expect(tools).not.toContain("edit");
    expect(tools).not.toContain("task");
    expect(options.enableMCP).toBe(false);
    expect(options.disableExtensionDiscovery).toBe(true);
    expect(options.restrictToolNames).toBe(true);
    expect(options.bindProcessState).toBe(false);
    expect(h.settingsOverrides[index]?.["retry.enabled"]).toBe(false);
    expect(h.settingsOverrides[index]?.["retry.fallbackChains"]).toEqual({});
    expect(options.contextFiles).toEqual([]);
  }
  expect(h.sessionOptions[0].customTools?.map((tool) => tool.name)).toEqual([
    "agad_research",
  ]);
  expect(h.sessionOptions[1].customTools).toEqual([]);
  expect(h.sessionOptions[0].parentAgentId).toBe("Main");
  expect(h.sessionOptions[1].parentAgentId).toBe(
    h.sessionOptions[0].agentId,
  );
  expect(h.sessionOptions[0].sessionManager).toBe(h.managers[0]);
  expect(h.sessionOptions[1].sessionManager).toBe(h.managers[1]);
  expect(h.managers[1].sessionDir).toBe(h.managers[0].sessionDir);
  const rootReferences = latestWorkerReferences(h.parentEntries),
    partnerSessionReferences = latestWorkerReferences(h.managers[0].entries);
  expect(rootReferences).toHaveLength(2);
  expect(rootReferences[0].role).toBe("decision_partner");
  expect(rootReferences[0].status).toBe("success");
  expect(rootReferences[1].role).toBe("scout");
  expect(rootReferences[1].parentAgentId).toBe(
    h.sessionOptions[0].agentId,
  );
  expect(rootReferences[1].parentSessionFile).toBe(h.managers[0].file);
  expect(partnerSessionReferences).toHaveLength(2);
  expect(partnerSessionReferences[1].role).toBe("scout");
  expect(partnerSessionReferences[1].status).toBe("success");
  expect(h.parentEntries.map((entry) => entry.customType)).toEqual([
    AGAD_WORKER_ENTRY,
    AGAD_WORKER_ENTRY,
    AGAD_WORKER_ENTRY,
    AGAD_WORKER_ENTRY,
  ]);
  expect(JSON.stringify(h.parentEntries)).not.toContain("Help me critique this");
  expect(JSON.stringify(h.parentEntries)).not.toContain("Evidence");
  expect(h.disposed.length).toBe(2);
});
test("early Test Engineer planning has no write or execution tools", async () => {
  const h = harness();
  await runSession(h.pi, h.ctx, "openai-codex", {
    role: "test_engineer",
    prompt: "Plan only",
    planning: true,
    scope: { production: ["src"], tests: ["tests"], checks: {} },
    runCheck: async () => "must not be exposed",
  });
  const tools = h.sessionOptions[0].toolNames ?? [];
  expect(tools).not.toContain("edit");
  expect(tools).not.toContain("write");
  expect(tools).not.toContain("agad_run_check");
  expect(h.sessionOptions[0].systemPrompt).toContain(
    "early scenario planning only",
  );
});
test("critical Business Reviewer is exactly Sol High with full native tools", async () => {
  const h = harness();
  await runSession(h.pi, h.ctx, "openai-codex", {
    role: "business_reviewer",
    critical: true,
    prompt: "Discover scenarios",
  });
  expect(h.sessionOptions[0].thinkingLevel).toBe("high");
  expect(h.sessionOptions[0].toolNames).toBeUndefined();
});
test("missing exact model fails before session execution", async () => {
  const h = harness();
  h.models.find = () => undefined;
  await expect(
    runSession(h.pi, h.ctx, "openai-codex", {
      role: "scout",
      prompt: "Research",
    }),
  ).rejects.toThrow("Unavailable exact");
  expect(h.sessionOptions).toHaveLength(0);
});
test("SDK model fallback is rejected and helper session disposed", async () => {
  const h = harness(false, { modelFallbackMessage: "Changed model" });
  await expect(
    runSession(h.pi, h.ctx, "openai-codex", {
      role: "scout",
      prompt: "Research",
    }),
  ).rejects.toThrow("refused fallback");
  expect(h.invocations).toHaveLength(0);
  expect(h.disposed).toHaveLength(1);
});
test("worker errors and aborts leave durable session references", async () => {
  const failed = harness(false, { promptError: new Error("provider failed") });
  await expect(
    runSession(failed.pi, failed.ctx, "openai-codex", {
      role: "scout",
      prompt: "Research",
    }),
  ).rejects.toThrow("provider failed");
  const failedReference = latestWorkerReferences(failed.parentEntries)[0];
  expect(failedReference.status).toBe("error");
  expect(failedReference.sessionFile).toBe(failed.managers[0].file);
  expect(failed.managers[0].materialized).toBe(true);
  expect(failed.managers[0].closeCount).toBe(1);
  expect(
    JSON.stringify(failedReference),
  ).not.toContain("provider failed");

  const aborted = harness(),
    abortController = new AbortController();
  abortController.abort();
  await expect(
    runSession(aborted.pi, aborted.ctx, "openai-codex", {
      role: "scout",
      prompt: "Research",
      signal: abortController.signal,
    }),
  ).rejects.toThrow();
  expect(latestWorkerReferences(aborted.parentEntries)[0].status).toBe(
    "aborted",
  );
  expect(aborted.invocations).toHaveLength(0);
  expect(aborted.managers[0].materialized).toBe(true);
  expect(aborted.managers[0].closeCount).toBe(1);
});
test("SDK creation failures keep the allocated native worker trace discoverable", async () => {
  const h = harness(false, { createError: new Error("session creation failed") });
  await expect(
    runSession(h.pi, h.ctx, "openai-codex", {
      role: "scout",
      prompt: "Research",
    }),
  ).rejects.toThrow("session creation failed");
  const reference = latestWorkerReferences(h.parentEntries)[0];
  expect(reference.status).toBe("error");
  expect(reference.sessionFile).toBe(h.managers[0].file);
  expect(latestWorkerReferences(h.managers[0].entries)[0].status).toBe("error");
  expect(h.managers[0].materialized).toBe(true);
  expect(h.managers[0].closeCount).toBe(1);
  expect(h.invocations).toHaveLength(0);
});
test("Architect status excludes private consultation transcript", () => {
  const h = harness();
  const controller = new Controller(h.pi, "openai-codex");
  controller.state.pending = {
    id: "q",
    question: "Q",
    options: [],
    context: "Context",
    consultation: [{ speaker: "partner", text: "Private critique" }],
  };
  expect(JSON.stringify(controller.publicState())).not.toContain(
    "Private critique",
  );
  expect(controller.publicState().pending?.id).toBe("q");
});
test("controller save and restore refresh the live view from the current branch without private state", () => {
  const h = harness();
  const changes: string[] = [];
  const controller = new Controller(h.pi, "openai-codex", () =>
    changes.push(controller.state.phase),
  );
  controller.state = {
    phase: "testing",
    pending: {
      id: "question-current",
      question: "Private question text",
      options: [{ label: "Approve" }],
      context: "Private checkpoint payload",
      consultation: [{ speaker: "partner", text: "Private consultation" }],
      revision: 4,
      candidate: "candidate-current",
    },
  } satisfies AdapterState;
  controller.save();
  expect(h.parentEntries[0].type).toBe("custom");
  expect(h.parentEntries[0].customType).toBe(STATE_ENTRY);
  expect(h.parentEntries[0].data).toEqual(controller.state);
  expect(changes).toEqual(["testing"]);

  const branch = [h.parentEntries[0]];
  controller.restore({
    sessionManager: { getBranch: () => branch },
  } as unknown as ExtensionContext);
  expect(controller.state).toEqual(h.parentEntries[0].data);
  expect(changes.at(-1)).toBe("testing");
  expect(JSON.stringify(controller.publicState())).not.toContain(
    "Private consultation",
  );

  controller.restore({
    sessionManager: { getBranch: () => [] },
  } as unknown as ExtensionContext);
  expect(controller.state).toEqual({ phase: "dialogue" });
  expect(changes.at(-1)).toBe("dialogue");
});
test("Implementer keeps the full native tool set, OMP features, and persistent session reuse across follow-ups", async () => {
  await resetWorkerSessions();
  const h = harness();
  await runSession(h.pi, h.ctx, "openai-codex", {
    role: "implementer",
    prompt: "Build it",
    scope: { production: ["src"], tests: ["tests"], checks: {} },
  });
  const options = h.sessionOptions[0];
  expect(options.agentName).toBe("agad-implementer");
  expect(options.agentId).toBe("agad-implementer");
  expect(options.toolNames).toBeUndefined();
  expect(options.restrictToolNames).toBeUndefined();
  expect(options.enableIrc).toBe(true);
  expect(options.enableLsp).toBe(true);
  expect(options.enableMCP).toBe(true);
  expect(options.spawns).toBe("*");
  expect(options.taskDepth).toBe(1);
  expect(options.appendSystemPrompt).toBeDefined();
  expect(options.systemPrompt).toBeUndefined();
  expect(options.model?.id).toBe("gpt-6.1-sol");
  expect(h.disposed).toHaveLength(0);

  // Follow-up reuses the same live session without creating a new one
  await runSession(h.pi, h.ctx, "openai-codex", {
    role: "implementer",
    prompt: "Incremental refinement",
    scope: { production: ["src"], tests: ["tests"], checks: {} },
  });
  expect(h.sessionOptions).toHaveLength(1);
  expect(h.invocations).toHaveLength(2);
  expect(h.invocations[1].prompt).toBe("Incremental refinement");

  // fresh: true disposes the old worker session and spawns a clean one
  await runSession(h.pi, h.ctx, "openai-codex", {
    role: "implementer",
    prompt: "Start over with new design",
    fresh: true,
    scope: { production: ["src"], tests: ["tests"], checks: {} },
  });
  expect(h.disposed).toEqual(["agad-implementer"]);
  expect(h.sessionOptions).toHaveLength(2);
  expect(h.invocations).toHaveLength(3);
  await resetWorkerSessions();
});

test("Implementer extension allows child subagent spawning and does not abort child subagents on different models or efforts", async () => {
  await resetWorkerSessions();
  const h = harness();
  const overlaid: Readonly<Record<string, unknown>>[] = [];
  (h.pi as unknown as { pi: { Settings: Record<string, unknown> } }).pi.Settings.current =
    Promise.resolve({
      overlay: (overrides: Readonly<Record<string, unknown>>) => {
        overlaid.push(overrides);
        return { ...overrides, overlaid: true };
      },
    });
  await runSession(h.pi, h.ctx, "openai-codex", {
    role: "implementer",
    prompt: "Build with subagents",
    scope: { production: ["src"], tests: ["tests"], checks: {} },
  });
  const options = h.sessionOptions[0];
  expect(overlaid).toEqual([
    {
      "retry.enabled": false,
      "retry.fallbackChains": {},
    },
  ]);
  const handlers = new Map<string, (...args: any[]) => any>();
  let thinkingLevel = "medium";
  const extFactory = options.extensions?.[0] as unknown as (api: any) => void;
  extFactory({
    on: (event: string, fn: (...args: any[]) => any) => handlers.set(event, fn),
    getThinkingLevel: () => thinkingLevel,
  });

  // 1. Subagent spawn is allowed for implementer
  expect(handlers.get("before_subagent_spawn")?.({})).toBeUndefined();

  // 2. Child subagent (e.g. implementation-worker or scout) inherits preparedExtensions in OMP;
  //    before_provider_request must NOT abort or reject the child subagent's own model/effort.
  let childAborted = false;
  thinkingLevel = "low";
  expect(() =>
    handlers.get("before_provider_request")?.(
      {},
      {
        agent: {
          kind: "subagent",
          id: "CoreCutover",
          name: "scout",
          parentId: "agad-implementer",
          depth: 2,
        },
        model: { provider: "openai-codex", id: "gpt-6-luna" },
        abort: () => {
          childAborted = true;
        },
      },
    ),
  ).not.toThrow();
  expect(childAborted).toBe(false);

  // 3. The implementer itself IS still strictly guarded against model/effort drift.
  let implementerAborted = false;
  expect(() =>
    handlers.get("before_provider_request")?.(
      {},
      {
        agent: {
          kind: "subagent",
          id: "agad-implementer",
          name: "agad-implementer",
          parentId: "Main",
          depth: 1,
        },
        model: { provider: "openai-codex", id: "gpt-6-luna" },
        abort: () => {
          implementerAborted = true;
        },
      },
    ),
  ).toThrow("AGAD implementer requires exactly openai-codex/gpt-6.1-sol:medium");
  expect(implementerAborted).toBe(true);
  await resetWorkerSessions();
});

