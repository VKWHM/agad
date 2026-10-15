import { expect, test } from "bun:test";
import { createServer } from "node:net";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const paneScript = fileURLToPath(new URL("../src/consultation-pane.ts", import.meta.url));

for (const phase of ["initializing", "waiting for reply"] as const) {
  test(`consultation process exits when its parent disconnects while ${phase}`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "agad-pane-test-"));
    const socketPath = join(directory, "s");
    let disconnectedAtPrompt = false;
    const server = createServer((socket) => {
      if (phase === "initializing") {
        socket.end();
        return;
      }
      socket.write(`${JSON.stringify({ type: "init", question: "Choose A or B", context: "Approved context", options: [{ label: "A" }, { label: "B" }], turns: [] })}\n`);
      let buffer = "";
      socket.setEncoding("utf8");
      socket.on("data", (chunk) => {
        buffer += chunk;
        let newline: number;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const frame = JSON.parse(buffer.slice(0, newline));
          buffer = buffer.slice(newline + 1);
          if (frame.type === "prompt") {
            expect(frame.text).toBe("Inspect the alternatives");
            disconnectedAtPrompt = true;
            socket.end();
          }
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(socketPath, resolve));
    const child = Bun.spawn([process.execPath, paneScript], {
      env: { ...process.env, AGAD_CONSULT_SOCKET: socketPath },
      stdin: "pipe", stdout: "pipe", stderr: "pipe",
    });
    // OS-process watchdog only; fake timers cannot terminate a hung child.
    const timer = setTimeout(() => child.kill("SIGKILL"), 3000);
    try {
      const output = (async () => {
        const reader = child.stdout.getReader();
        const decoder = new TextDecoder();
        let text = "";
        let sent = false;
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          text += decoder.decode(chunk.value, { stream: true });
          if (phase === "waiting for reply" && !sent && text.includes("You> ")) {
            sent = true;
            child.stdin.write("Inspect the alternatives\n");
            child.stdin.flush();
          }
        }
      })();
      expect(await child.exited).toBe(0);
      await output;
      expect(disconnectedAtPrompt).toBe(phase === "waiting for reply");
    } finally {
      clearTimeout(timer);
      child.kill("SIGKILL");
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    }
  });
}

test("cancelling a stalled tmux launch returns without starting a Partner request", async () => {
  const directory = await mkdtemp(join(tmpdir(), "agad-tmux-test-"));
  await writeFile(join(directory, "tmux"), "#!/bin/sh\nkill -USR1 \"$PPID\"\nexec /bin/sleep 60\n", { mode: 0o700 });
  const code = `
    import { runTmuxConsultation } from ${JSON.stringify(paneScript)};
    import { strict as assert } from "node:assert";
    const abort = new AbortController();
    let calls = 0;
    const question = {id:"q",question:"Choose",context:"Original",options:[{label:"A"}],consultation:[]};
    const cancel = () => abort.abort(new Error("Cancelled after tmux started"));
    process.once("SIGUSR1", cancel);
    try {
      const result = await runTmuxConsultation(question, { save() { throw new Error("No turn was submitted"); }, partner: async () => { calls++; return "No response expected"; } }, abort.signal);
      assert.equal(result.opened, false);
      assert.equal(calls, 0);
      assert.deepEqual(question.consultation, []);
    } finally { process.off("SIGUSR1", cancel); }
  `;
  const child = Bun.spawn([process.execPath, "-e", code], {
    env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, TMUX: "fixture", TMUX_PANE: "%0" },
    stdin: "ignore", stdout: "pipe", stderr: "pipe",
  });
  // OS-process watchdog only; cancellation itself is driven by the child's readiness signal.
  const timer = setTimeout(() => child.kill("SIGKILL"), 3000);
  try {
    expect(await child.exited).toBe(0);
  } finally {
    clearTimeout(timer);
    child.kill("SIGKILL");
    await rm(directory, { recursive: true, force: true });
  }
});

test("generateConsultationMarkdown formats brief with question, options, context, and previous turns", async () => {
  const { generateConsultationMarkdown } = await import("../src/consultation-pane.ts");
  const markdown = generateConsultationMarkdown({
    id: "test-q",
    question: "Should we allow early planning?",
    options: [
      { label: "Yes", description: "Allow early planning" },
      { label: "No", description: "Keep strict sequence" },
    ],
    context: "Context detail about governance",
    consultation: [
      { speaker: "developer", text: "What are the risks?" },
      { speaker: "partner", text: "Low risk if write tools are omitted." },
    ],
  });
  expect(markdown).toContain("# AGAD Decision Partner — Consultation Brief");
  expect(markdown).toContain("## Pending Question\nShould we allow early planning?");
  expect(markdown).toContain("- **Yes** — Allow early planning");
  expect(markdown).toContain("- **No** — Keep strict sequence");
  expect(markdown).toContain("## Context\nContext detail about governance");
  expect(markdown).toContain("### Developer\nWhat are the risks?");
  expect(markdown).toContain("### Decision Partner\nLow risk if write tools are omitted.");
});

test("consultation pane responds to /context by displaying the brief", async () => {
  const directory = await mkdtemp(join(tmpdir(), "agad-context-test-"));
  const socketPath = join(directory, "s");
  const briefPath = join(directory, "brief.md");
  await writeFile(briefPath, "# Custom Test Brief\nDetails here", "utf8");
  const server = createServer((socket) => {
    socket.write(`${JSON.stringify({
      type: "init",
      question: "Choose A or B",
      context: "Context",
      options: [{ label: "A" }],
      turns: [],
      briefPath,
    })}\n`);
  });
  await new Promise<void>((resolve) => server.listen(socketPath, resolve));
  const child = Bun.spawn([process.execPath, paneScript], {
    env: { ...process.env, AGAD_CONSULT_SOCKET: socketPath, AGAD_CONSULT_BRIEF: briefPath },
    stdin: "pipe", stdout: "pipe", stderr: "pipe",
  });
  const timer = setTimeout(() => child.kill("SIGKILL"), 3000);
  try {
    let output = "";
    let sentContext = false;
    let sentReturn = false;
    const reader = child.stdout.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      output += decoder.decode(chunk.value, { stream: true });
      if (!sentContext && output.includes("You> ")) {
        sentContext = true;
        child.stdin.write("/context\n");
        child.stdin.flush();
      } else if (sentContext && !sentReturn && output.includes("# Custom Test Brief")) {
        sentReturn = true;
        child.stdin.write("/return\n");
        child.stdin.flush();
      }
    }
    expect(await child.exited).toBe(0);
    expect(output).toContain("# Custom Test Brief");
    expect(output).toContain("Details here");
  } finally {
    clearTimeout(timer);
    child.kill("SIGKILL");
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
