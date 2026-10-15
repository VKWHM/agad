import { expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { Controller } from "../src/controller.ts";
import { fingerprint } from "../src/scope.ts";
const source = await Bun.file(
  new URL("../../../examples/accepted.json", import.meta.url),
).json();
async function verification(changeTests: boolean, changeDuringCommand = false) {
  const cwd = await mkdtemp(join(tmpdir(), "agad-check-execution-"));
  try {
    await mkdir(join(cwd, "src"));
    await mkdir(join(cwd, "tests"));
    await writeFile(join(cwd, "src", "domain.ts"), "production");
    await writeFile(join(cwd, "tests", "domain.ts"), "test assertions");
    const model = {
      id: "gpt-6-luna",
      provider: "openai-codex",
      thinking: { efforts: ["high"] },
    };
    const pi = {
      appendEntry() {},
      zod: { object: (x: unknown) => x, string: () => ({}) },
      pi: {
        Settings: { isolated: (x: unknown) => x },
        SessionManager: { inMemory: () => ({}) },
        createAgentSession: async (o: any) => ({
          session: {
            model,
            thinkingLevel: "high",
            abort: async () => {},
            dispose: async () => {},
            messages: [
              {
                role: "assistant",
                stopReason: "stop",
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      status: "pass",
                      covered: ["R1", "R2", "R3"],
                      evidence: "actual-command-run",
                    }),
                  },
                ],
              },
            ],
            prompt: async () => {
              await o.customTools[0].execute(
                "check",
                { id: "reservation-behavior" },
                undefined,
                undefined,
                new AbortController().signal,
              );
              if (changeTests)
                await writeFile(
                  join(cwd, "tests", "domain.ts"),
                  "modified after passing check",
                );
            },
          },
        }),
      },
    } as unknown as ExtensionAPI;
    const ctx = {
      cwd,
      modelRegistry: {
        find: () => model,
        getApiKey: async () => "test-only",
        authStorage: {},
      },
    } as unknown as ExtensionContext;
    const record = structuredClone(source);
    record.events = record.events.slice(0, 4);
    const candidate = await fingerprint(cwd, ["src"]);
    for (const e of record.events) if (e.candidate) e.candidate = candidate;
    const command = changeDuringCommand
      ? "require('fs').writeFileSync('tests/domain.ts','changed during check')"
      : "process.exit(0)";
    const controller = new Controller(pi, "openai-codex");
    controller.state = {
      phase: "test_authorized",
      record,
      scope: {
        production: ["src"],
        tests: ["tests"],
        checks: { "reservation-behavior": [process.execPath, "-e", command] },
      },
    };
    return {
      result: await controller.delegate(
        ctx,
        "test_engineer",
        "Execute approved checks",
      ),
      state: controller.state,
    };
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}
test("actual approved command results are recorded by host and reach tested phase", async () => {
  const run = await verification(false);
  expect(run.state.phase).toBe("tested");
  const event = JSON.parse(run.result);
  expect(event.checks[0].status).toBe("pass");
  expect(JSON.parse(event.checks[0].evidence).exit).toBe(0);
  expect(event.checks[0].test_fingerprint).toStartWith("sha256:");
});
test("model cannot retain PASS after editing test files after a successful command", async () => {
  await expect(verification(true)).rejects.toThrow("changed after checks");
});
test("a check that mutates test artifacts cannot silently certify those artifacts", async () => {
  await expect(verification(false, true)).rejects.toThrow(
    "changed during check execution",
  );
});
