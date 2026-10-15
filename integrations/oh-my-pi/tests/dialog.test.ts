import { expect, test } from "bun:test";
import type { ExtensionUIContext } from "@oh-my-pi/pi-coding-agent";
import { askPending, isExplicitApproval } from "../src/dialog.ts";
import { checkpointPresentation } from "../src/presentation.ts";
import type { PendingQuestion } from "../src/types.ts";
const pending = (): PendingQuestion => ({
  id: "question-1",
  question: "Choose consistency policy",
  options: [{ label: "A" }, { label: "B" }],
  context: "Approved domain context",
  consultation: [],
  revision: 2,
  candidate: "candidate-1",
});
function ui(overrides: Record<string, unknown>): ExtensionUIContext {
  return { notify() {}, ...overrides } as unknown as ExtensionUIContext;
}
function submit(selected: string, customInput?: string) {
  return {
    kind: "submit",
    results: [{ id: "question-1", selectedOptions: [selected], customInput }],
  };
}
test("consultation preserves original question and returns only final human answer", async () => {
  const question = pending(),
    seen: unknown[] = [];
  let n = 0,
    saves = 0;
  const answer = await askPending(question, {
    save() {
      saves++;
    },
    partner: async (prompt) => {
      expect(prompt).toBe("Research the trade-offs");
      return "Advisory analysis with sources";
    },
    ui: ui({
      askDialog: async (q: unknown) => {
        seen.push(q);
        return n++ === 0 ? { kind: "chat" } : submit("B");
      },
      input: async () => "Research the trade-offs",
      editor: async () => "Ignore edited text",
      select: async () => "Return to Architect question",
    }),
  });
  expect(answer?.selected).toBe("B");
  expect(seen[0]).toEqual(seen[1]);
  expect(question.id).toBe("question-1");
  expect(question.revision).toBe(2);
  expect(question.candidate).toBe("candidate-1");
  expect(question.consultation).toEqual([
    { speaker: "developer", text: "Research the trade-offs" },
    { speaker: "partner", text: "Advisory analysis with sources" },
  ]);
  expect(saves).toBe(2);
});
test("cancellation leaves pending question unresolved", async () => {
  const question = pending();
  expect(
    await askPending(question, {
      ui: ui({ askDialog: async () => undefined }),
      save() {},
      partner: async () => "",
    }),
  ).toBeUndefined();
  expect(question.id).toBe("question-1");
});
test("timeouts never become approval", async () => {
  const result = await askPending(pending(), {
    ui: ui({
      askDialog: async () => ({
        kind: "submit",
        results: [{ id: "question-1", selectedOptions: ["A"], timedOut: true }],
      }),
    }),
    save() {},
    partner: async () => "",
  });
  expect(result).toBeUndefined();
});
test("free text is retained and never interpreted as checkpoint approval", async () => {
  const answer = await askPending(pending(), {
    ui: ui({
      askDialog: async () => ({
        kind: "submit",
        results: [
          {
            id: "question-1",
            selectedOptions: [],
            customInput: "Approve but change behavior",
          },
        ],
      }),
    }),
    save() {},
    partner: async () => "",
  });
  expect(answer?.custom).toContain("change behavior");
  expect(isExplicitApproval(answer)).toBe(false);
  expect(
    isExplicitApproval({ selected: "Approve", custom: "with changes" }),
  ).toBe(false);
  expect(isExplicitApproval({ selected: "Approve" })).toBe(true);
});
test("dialog displays original question context to human", async () => {
  await askPending(pending(), {
    ui: ui({
      askDialog: async (q: { question: string }[]) => {
        expect(q[0].question).toContain("Approved domain context");
        return submit("A");
      },
    }),
    save() {},
    partner: async () => "",
  });
});
test("partner failure returns to original question without choosing an option", async () => {
  let n = 0;
  const answer = await askPending(pending(), {
    ui: ui({
      askDialog: async () => (n++ === 0 ? { kind: "chat" } : submit("A")),
      input: async () => "Search",
    }),
    save() {},
    partner: async () => {
      throw new Error("Scout unavailable");
    },
  });
  expect(answer?.selected).toBe("A");
  expect(n).toBe(2);
});
test("fallback UI supports typed answers without treating cancel as an answer", async () => {
  const answer = await askPending(pending(), {
    ui: ui({
      select: async () => "Type another answer",
      input: async () => "C",
    }),
    save() {},
    partner: async () => "",
  });
  expect(answer?.custom).toBe("C");
});
test("wrong question IDs cannot resolve a pending question", async () => {
  const result = await askPending(pending(), {
    ui: ui({
      askDialog: async () => ({
        kind: "submit",
        results: [{ id: "different", selectedOptions: ["A"] }],
      }),
    }),
    save() {},
    partner: async () => "",
  });
  expect(result).toBeUndefined();
});
test("rich and fallback dialogs expose distinct consultation and details actions", async () => {
  for (const rich of [true, false]) {
    const question = pending();
    question.options = [
      { label: "Review full details" },
      { label: "Chat about this — Decision Partner" },
      { label: "Approve" },
    ];
    question.event = { type: "approve_contract" } as PendingQuestion["event"];
    question.context = JSON.stringify({
      event: { type: "approve_contract" },
      contract: { intent: "Authorize only implementation" },
    });
    let labels: string[] = [];
    const answer = await askPending(question, {
      save() {},
      partner: async () => "private advice",
      ui: ui({
        askDialog: rich
          ? async (dialogs: { options: { label: string }[] }[]) => {
              labels = dialogs[0].options.map((option) => option.label);
              return submit("Review full details");
            }
          : undefined,
        select: rich
          ? undefined
          : async (_question: string, options: string[]) => {
              labels = options;
              return "Review full details";
            },
        input: async () => undefined,
      }),
    });
    expect(labels).toContain("Review full details (2)");
    expect(labels).toContain("Chat about this — Decision Partner (2)");
    expect(answer?.selected).toBe("Review full details");
  }
});

test("details display preserves exact nested payload and discards editor changes", async () => {
  const payload = {
    event: { type: "provisionally_approve", dispositions: { R7: { reason: "exact" } } },
    contract: { requirements: [{ id: "R7", provenance: { source: "architect:decision" } }] },
    scope: { production: ["src/**"], tests: ["tests/**"] },
    checks: { typecheck: ["bun", "run", "--cwd", "adapter", "typecheck"] },
    checkpoint: { evidence: "long/nested/☃", legacy: { unknown: [1, { keep: true }] } },
  };
  const question = pending();
  question.event = payload.event as PendingQuestion["event"];
  question.context = JSON.stringify(payload);
  let editors = 0;
  let prompts: { question: string }[] = [];
  const answer = await askPending(question, {
    save() {},
    partner: async () => "",
    ui: ui({
      askDialog: async (dialogs: { question: string }[]) => {
        prompts.push(dialogs[0]);
        return editors++ === 0
          ? { kind: "submit", results: [{ id: question.id, selectedOptions: ["Review full details"] }] }
          : submit("Request changes");
      },
      editor: async (_title: string, content: string) => {
        for (const value of ["provisional", "bun", "run", "--cwd", "adapter", "R7", "☃", "unknown", "true"])
          expect(content).toContain(value);
        return "edited payload that must not be submitted";
      },
    }),
  });
  expect(editors).toBe(2);
  expect(prompts[0]).toEqual(prompts[1]);
  expect(answer?.selected).toBe("Request changes");

  const summary = checkpointPresentation(payload);
  expect(summary.summary).toContain("authorizes test writing and execution");
  expect(summary.summary).not.toContain("authorizes implementation");
});

test("complete details retain every event and payload field, including ordered exact argv", () => {
  const payload = {
    event: {
      type: "approve_test_gap",
      outcomes: ["R7", "R4"],
      reason: "reason exact",
      impact: "impact exact",
      revisit: "trigger exact",
      candidate: "candidate exact",
      disposition: { actor: "human", decision: "human:exact" },
    },
    contract: {
      requirements: [{ id: "R7", source: "architect:decision", bounds: "bounds exact" }],
    },
    scope: { production: ["src/a.ts"], tests: ["tests/a.test.ts"] },
    checks: { run: ["bun", "run", "--cwd", "adapter", "typecheck"] },
    checkpoint: { evidence: "evidence exact", unknownField: { retained: true } },
  };
  const details = checkpointPresentation(payload).details;
  for (const value of [
    "R7", "R4", "reason exact", "impact exact", "trigger exact",
    "candidate exact", "human:exact", "architect:decision", "bounds exact",
    "src/a.ts", "tests/a.test.ts", "bun", "--cwd", "typecheck",
    "evidence exact", "unknownField", "retained",
  ]) expect(details).toContain(value);
  expect(details.indexOf("R7")).toBeLessThan(details.indexOf("R4"));
});
