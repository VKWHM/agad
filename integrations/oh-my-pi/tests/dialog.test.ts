import { expect, test } from "bun:test";
import type { ExtensionUIContext } from "@oh-my-pi/pi-coding-agent";
import { askPending, isExplicitApproval } from "../src/dialog.ts";
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
