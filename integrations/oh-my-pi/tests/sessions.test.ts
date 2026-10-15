import { expect, test } from "bun:test";
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { runSession } from "../src/sessions.ts";
import { STATE_ENTRY } from "../src/types.ts";
function harness(research = false) {
  const options: any[] = [],
    invocations: any[] = [],
    disposed: string[] = [];
  const models = {
    find: (provider: string, id: string) => ({
      provider,
      id,
      thinking: { efforts: ["low", "medium", "high"] },
    }),
    getApiKey: async () => "test-only",
    authStorage: {},
  };
  const pi = {
    zod: { object: (x: unknown) => x, string: () => ({}) },
    pi: {
      Settings: { isolated: (s: unknown) => s },
      SessionManager: { inMemory: () => ({}) },
      createAgentSession: async (o: any) => {
        options.push(o);
        return {
          session: {
            model: o.model,
            thinkingLevel: o.thinkingLevel,
            messages: [
              {
                role: "assistant",
                stopReason: "stop",
                content: [{ type: "text", text: "Evidence" }],
              },
            ],
            abort: async () => {},
            dispose: async () => {
              disposed.push(o.agentName);
            },
            prompt: async (prompt: string) => {
              invocations.push({ role: o.agentName, prompt });
              if (research && o.agentName === "agad-decision-partner")
                await o.customTools[0].execute(
                  "research",
                  { question: "Find evidence" },
                  undefined,
                  undefined,
                  {},
                );
            },
          },
        };
      },
    },
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd: process.cwd(),
    modelRegistry: models,
  } as unknown as ExtensionContext;
  return { pi, ctx, options, invocations, disposed };
}
test("partner can delegate research only to read-only mapped Scout sessions", async () => {
  const h = harness(true);
  await runSession(h.pi, h.ctx, "openai-codex", {
    role: "decision_partner",
    prompt: "Help me critique this",
  });
  expect(h.options.map((o) => o.agentName)).toEqual([
    "agad-decision-partner",
    "agad-scout",
  ]);
  expect(h.options[0].model.id).toBe("gpt-6.1-sol");
  expect(h.options[0].thinkingLevel).toBe("medium");
  expect(h.options[1].model.id).toBe("gpt-6-luna");
  expect(h.options[1].thinkingLevel).toBe("low");
  for (const o of h.options) {
    expect(o.toolNames).not.toContain("bash");
    expect(o.toolNames).not.toContain("write");
    expect(o.toolNames).not.toContain("edit");
    expect(o.toolNames).not.toContain("task");
    expect(o.enableMCP).toBe(false);
    expect(o.disableExtensionDiscovery).toBe(true);
    expect(o.restrictToolNames).toBe(true);
    expect(o.bindProcessState).toBe(false);
    expect(o.settings["retry.enabled"]).toBe(false);
    expect(o.settings["retry.fallbackChains"]).toEqual({});
    expect(o.contextFiles).toEqual([]);
  }
  expect(h.options[0].customTools.map((t: any) => t.name)).toEqual([
    "agad_research",
  ]);
  expect(h.options[1].customTools).toEqual([]);
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
  const o = h.options[0];
  expect(o.toolNames).not.toContain("edit");
  expect(o.toolNames).not.toContain("write");
  expect(o.toolNames).not.toContain("agad_run_check");
  expect(o.systemPrompt).toContain("early scenario planning only");
});
test("critical Business Reviewer is exactly Sol High without production writes", async () => {
  const h = harness();
  await runSession(h.pi, h.ctx, "openai-codex", {
    role: "business_reviewer",
    critical: true,
    prompt: "Discover scenarios",
  });
  expect(h.options[0].thinkingLevel).toBe("high");
  expect(h.options[0].toolNames).not.toContain("write");
});
test("missing exact model fails before session execution", async () => {
  const h = harness();
  (h.ctx.modelRegistry.find as any) = () => undefined;
  await expect(
    runSession(h.pi, h.ctx, "openai-codex", {
      role: "scout",
      prompt: "Research",
    }),
  ).rejects.toThrow("Unavailable exact");
  expect(h.options).toHaveLength(0);
});
test("SDK model fallback is rejected and helper session disposed", async () => {
  const h = harness();
  const original = h.pi.pi.createAgentSession;
  (h.pi.pi.createAgentSession as any) = async (o: any) => ({
    ...(await original(o)),
    modelFallbackMessage: "Changed model",
  });
  await expect(
    runSession(h.pi, h.ctx, "openai-codex", {
      role: "scout",
      prompt: "Research",
    }),
  ).rejects.toThrow("refused fallback");
  expect(h.invocations).toHaveLength(0);
  expect(h.disposed).toHaveLength(1);
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
  const entries: any[] = [];
  (h.pi as any).appendEntry = (type: string, data: unknown) => entries.push({ type, data });
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
  } as any;
  controller.save();
  expect(entries[0].type).toBe(STATE_ENTRY);
  expect(entries[0].data).toEqual(controller.state);
  expect(changes).toEqual(["testing"]);

  const branch = [{ type: "custom", customType: STATE_ENTRY, data: entries[0].data }];
  controller.restore({
    sessionManager: { getBranch: () => branch },
  } as any);
  expect(controller.state).toEqual(entries[0].data);
  expect(changes.at(-1)).toBe("testing");
  expect(JSON.stringify(controller.publicState())).not.toContain("Private consultation");

  controller.restore({ sessionManager: { getBranch: () => [] } } as any);
  expect(controller.state).toEqual({ phase: "dialogue" });
  expect(changes.at(-1)).toBe("dialogue");
});
