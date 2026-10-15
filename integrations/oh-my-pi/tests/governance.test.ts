import { guardIdentity } from "../src/roles.ts";
import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { append, validate } from "../src/core.ts";
import { profiles, profile, assertIdentity } from "../src/roles.ts";
import { allowWrite, fingerprint } from "../src/scope.ts";
import { Controller } from "../src/controller.ts";
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
const source = await Bun.file(
  new URL("../../../examples/accepted.json", import.meta.url),
).json();
const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0))
    await rm(dir, { recursive: true, force: true });
});
async function workspace() {
  const dir = await mkdtemp(join(tmpdir(), "agad-omp-test-"));
  dirs.push(dir);
  await mkdir(join(dir, "src"));
  await mkdir(join(dir, "tests"));
  return dir;
}
test("exact source model and effort mapping, including user-selected partner", () => {
  expect(JSON.parse(JSON.stringify(profiles.architect))).toEqual({
    id: "gpt-6.1-sol",
    effort: "high",
  });
  expect(String(profiles.implementer.effort)).toBe("medium");
  expect(JSON.parse(JSON.stringify(profiles.scout))).toEqual({
    id: "gpt-6-luna",
    effort: "low",
  });
  expect(String(profiles.test_engineer.effort)).toBe("high");
  expect(String(profiles.decision_partner.effort)).toBe("medium");
  expect(String(profile("business_reviewer", true).effort)).toBe("high");
});
test("strict identity rejects fallback, wrong provider and effort downgrade", () => {
  expect(() =>
    assertIdentity(
      { provider: "openai-codex", id: "gpt-6.1-sol" },
      "high",
      "openai-codex",
      "architect",
    ),
  ).not.toThrow();
  for (const [id, provider, effort] of [
    ["gpt-6-sol", "openai-codex", "high"],
    ["gpt-6.1-sol", "other", "high"],
    ["gpt-6.1-sol", "openai-codex", "medium"],
  ])
    expect(() =>
      assertIdentity({ id, provider }, effort, "openai-codex", "architect"),
    ).toThrow();
});
test("bridge uses unchanged core validator and rejects skipped review", async () => {
  expect(await validate(source)).toBe("accepted");
  const record = structuredClone(source);
  record.events.splice(2, 1);
  await expect(validate(record)).rejects.toThrow("Core rejected");
});
test("bridge rejects direct testing before human provisional approval", async () => {
  const record = structuredClone(source);
  record.events.splice(3, 1);
  await expect(validate(record)).rejects.toThrow();
});
test("failed transition cannot mutate existing record", async () => {
  const record = structuredClone(source);
  const before = JSON.stringify(record);
  await expect(
    append(record, { type: "cancel", actor: "architect" }),
  ).rejects.toThrow();
  expect(JSON.stringify(record)).toBe(before);
});
test("write allowlist rejects production writes by test scope and metadata paths", async () => {
  const cwd = await workspace();
  await allowWrite(cwd, "tests/new.test.ts", ["tests"]);
  await expect(allowWrite(cwd, "src/domain.ts", ["tests"])).rejects.toThrow();
  await expect(allowWrite(cwd, "../escape", ["tests"])).rejects.toThrow();
  await expect(allowWrite(cwd, ".git/config", [".git"])).rejects.toThrow();
});
test("symlinks cannot escape approved write scope", async () => {
  const cwd = await workspace();
  await symlink(tmpdir(), join(cwd, "tests", "escape"));
  await expect(allowWrite(cwd, "tests/escape/new", ["tests"])).rejects.toThrow(
    "Symlink",
  );
});
test("candidate fingerprint detects source changes but not test edits", async () => {
  const cwd = await workspace();
  await writeFile(join(cwd, "src", "domain.ts"), "before");
  const before = await fingerprint(cwd, ["src"]);
  await writeFile(join(cwd, "tests", "test.ts"), "test");
  expect(await fingerprint(cwd, ["src"])).toBe(before);
  await writeFile(join(cwd, "src", "domain.ts"), "after");
  expect(await fingerprint(cwd, ["src"])).not.toBe(before);
});
test("pending question blocks delegation before any model call", async () => {
  const controller = new Controller({} as ExtensionAPI, "openai-codex");
  controller.state.pending = {
    id: "q",
    question: "Q",
    options: [],
    context: "",
    consultation: [],
  };
  await expect(
    controller.delegate({} as ExtensionContext, "implementer", "Go"),
  ).rejects.toThrow("pending");
});
test("resuming after cancellation retains exact question", async () => {
  const entries: unknown[] = [];
  const pi = {
    appendEntry: (_type: unknown, state: unknown) => entries.push(state),
  } as unknown as ExtensionAPI;
  const controller = new Controller(pi, "openai-codex");
  controller.state.pending = {
    id: "q",
    question: "Q",
    options: [{ label: "A" }, { label: "B" }],
    context: "original",
    consultation: [],
  };
  const ctx = {
    hasUI: true,
    ui: { askDialog: async () => undefined },
  } as unknown as ExtensionContext;
  expect(await controller.resume(ctx)).toEqual({
    status: "pending",
    question_id: "q",
  });
  expect(controller.state.pending?.context).toBe("original");
});
test("late answer after a session change cannot affect the new session", async () => {
  const controller = new Controller(
    { appendEntry() {} } as unknown as ExtensionAPI,
    "openai-codex",
  );
  controller.state.pending = {
    id: "q",
    question: "Q",
    options: [{ label: "A" }],
    context: "old",
    consultation: [],
  };
  const ctx = {
    hasUI: true,
    ui: {
      askDialog: async () => {
        controller.generation++;
        controller.state = { phase: "dialogue" };
        return {
          kind: "submit",
          results: [{ id: "q", selectedOptions: ["A"] }],
        };
      },
    },
  } as unknown as ExtensionContext;
  await expect(controller.resume(ctx)).rejects.toThrow("different session");
  expect(controller.state.pending).toBeUndefined();
});
test("approval cannot be fabricated through a generic checkpoint", async () => {
  const controller = new Controller(
    { appendEntry() {} } as unknown as ExtensionAPI,
    "openai-codex",
  );
  controller.state.record = { ...structuredClone(source), events: [] };
  await expect(
    controller.checkpoint({ hasUI: true } as ExtensionContext, {
      type: "approve_contract",
      revision: 2,
    }),
  ).rejects.toThrow("scope-bound");
});
test("custom answer to a checkpoint is feedback, not approval", async () => {
  const controller = new Controller(
    { appendEntry() {} } as unknown as ExtensionAPI,
    "openai-codex",
  );
  controller.state.pending = {
    id: "q",
    question: "Approve?",
    options: [{ label: "Approve" }, { label: "Request changes" }],
    context: "exact event",
    consultation: [],
    event: { type: "approve_contract", revision: 2 },
  };
  const ctx = {
    hasUI: true,
    ui: {
      askDialog: async () => ({
        kind: "submit",
        results: [
          {
            id: "q",
            selectedOptions: [],
            customInput: "approve after changing scope",
          },
        ],
      }),
    },
  } as unknown as ExtensionContext;
  const result = await controller.resume(ctx);
  expect(result.approved).toBe(false);
  expect(controller.state.record).toBeUndefined();
  expect(controller.state.pending).toBeUndefined();
});
test("declined proposal cannot replace an already approved write scope", async () => {
  const cwd = await workspace();
  const controller = new Controller(
    { appendEntry() {} } as unknown as ExtensionAPI,
    "openai-codex",
  );
  const oldScope = {
    production: ["src/old.ts"],
    tests: ["tests"],
    checks: { "reservation-behavior": ["true"] },
  };
  controller.state = {
    phase: "dialogue",
    record: {
      ...structuredClone(source),
      events: [
        source.events[0],
        {
          type: "revise",
          actor: "architect",
          reason: "Reconcile developer feedback",
        },
      ],
    },
    scope: oldScope,
  };
  const proposed = {
    ...structuredClone(source.contracts[0]),
    revision: 3,
    teach_back: "Restated proposed behavior",
  };
  const ctx = {
    cwd,
    hasUI: true,
    ui: {
      askDialog: async (q: any[]) => ({
        kind: "submit",
        results: [{ id: q[0].id, selectedOptions: ["Request changes"] }],
      }),
    },
  } as unknown as ExtensionContext;
  await controller.contract(ctx, "reservation-cancel", proposed, {
    production: ["src/new.ts"],
    tests: ["tests"],
    checks: { "reservation-behavior": ["true"] },
  });
  expect(controller.state.scope).toEqual(oldScope);
  expect(controller.state.record?.events).toHaveLength(2);
});
test("overlapping normalized production/test scopes fail closed", async () => {
  const cwd = await workspace();
  const controller = new Controller(
    { appendEntry() {} } as unknown as ExtensionAPI,
    "openai-codex",
  );
  await expect(
    controller.contract({ cwd } as ExtensionContext, "x", source.contracts[0], {
      production: ["src/../tests"],
      tests: ["tests"],
      checks: { "reservation-behavior": ["true"] },
    }),
  ).rejects.toThrow("disjoint");
});
test("final acceptance detects changed test artifacts after passing report", async () => {
  const cwd = await workspace();
  await writeFile(join(cwd, "src", "domain.ts"), "production");
  await writeFile(join(cwd, "tests", "domain.ts"), "original checks");
  const candidate = await fingerprint(cwd, ["src"]);
  const controller = new Controller({} as ExtensionAPI, "openai-codex");
  controller.state = {
    phase: "tested",
    scope: { production: ["src"], tests: ["tests"], checks: {} },
    record: { events: [{ type: "submit_implementation", candidate }] },
    verification: {
      tests: await fingerprint(cwd, ["tests"]),
      delivery: "d",
      report: "r",
    },
  };
  await writeFile(join(cwd, "tests", "domain.ts"), "weakened checks");
  await expect(
    controller.freshIfCandidate({ cwd } as ExtensionContext, {
      type: "accept",
      candidate,
    }),
  ).rejects.toThrow("Test artifacts changed");
});

test("identity guard aborts explicitly because OMP isolates hook exceptions", () => {
  let aborted = false;
  const ctx = {
    model: { provider: "openai-codex", id: "gpt-6-sol" },
    abort() {
      aborted = true;
    },
  } as unknown as ExtensionContext;
  expect(() =>
    guardIdentity(ctx, "high", "openai-codex", "architect"),
  ).toThrow();
  expect(aborted).toBe(true);
});

test("stale candidate rejection during approval unblocks question and returns error", async () => {
  const cwd = await workspace();
  await writeFile(join(cwd, "src", "domain.ts"), "v1");
  const candidate = await fingerprint(cwd, ["src"]);
  const entries: unknown[] = [];
  const pi = {
    appendEntry: (_type: unknown, state: unknown) => entries.push(state),
  } as unknown as ExtensionAPI;
  const controller = new Controller(pi, "openai-codex");
  controller.state = {
    phase: "reviewed",
    scope: { production: ["src"], tests: ["tests"], checks: {} },
    record: {
      ...structuredClone(source),
      events: [
        ...source.events.slice(0, 3),
      ],
    },
    pending: {
      id: "checkpoint-q",
      question: "Provisional approval",
      options: [{ label: "Approve" }, { label: "Request changes" }],
      context: "context",
      consultation: [],
      event: {
        type: "provisionally_approve",
        actor: "developer",
        revision: 1,
        candidate,
        finding_dispositions: [],
      },
    },
  };
  // Simulate modifying production file before developer answers
  await writeFile(join(cwd, "src", "domain.ts"), "v2 modified");
  const ctx = {
    cwd,
    hasUI: true,
    ui: {
      askDialog: async () => ({
        kind: "submit",
        results: [{ id: "checkpoint-q", selectedOptions: ["Approve"] }],
      }),
    },
  } as unknown as ExtensionContext;

  const result = await controller.resume(ctx);
  expect(result.status).toBe("answered");
  expect(result.approved).toBe(false);
  expect(result.error).toContain("Production changed after implementation");
  expect(controller.state.pending).toBeUndefined();
  expect(entries.length).toBeGreaterThan(0);
});

test("cancelPending clears pending question and unblocks state", () => {
  const entries: unknown[] = [];
  const pi = {
    appendEntry: (_type: unknown, state: unknown) => entries.push(state),
  } as unknown as ExtensionAPI;
  const controller = new Controller(pi, "openai-codex");
  expect(controller.cancelPending()).toBeUndefined();
  controller.state.pending = {
    id: "q-1",
    question: "Do something",
    options: [{ label: "Yes" }, { label: "No" }],
    context: "test",
    consultation: [],
  };
  const cancelled = controller.cancelPending();
  expect(cancelled?.id).toBe("q-1");
  expect(controller.state.pending).toBeUndefined();
  expect(entries.length).toBe(1);
});

