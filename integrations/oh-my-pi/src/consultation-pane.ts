import { existsSync } from "node:fs";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import {
  createServer,
  createConnection,
  type Server,
  type Socket,
} from "node:net";
import { createInterface, type Interface } from "node:readline";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PendingQuestion } from "./types.ts";

const MAX_FRAME_BYTES = 2 * 1024 * 1024;
const MAX_PROMPT_BYTES = 32 * 1024;
const PANE_SCRIPT = fileURLToPath(
  new URL("./consultation-pane.ts", import.meta.url),
);

export function generateConsultationMarkdown(pending: PendingQuestion): string {
  const parts: string[] = [
    "# AGAD Decision Partner — Consultation Brief",
    "",
    "> **Advisory only**: Private consultation with Developer. Does not approve work or modify code.",
    "",
    "## Pending Question",
    pending.question,
    "",
    "## Options",
  ];
  for (const option of pending.options) {
    parts.push(
      `- **${option.label}**${option.description ? ` — ${option.description}` : ""}`,
    );
  }
  parts.push("", "## Context", pending.context);
  if (pending.consultation && pending.consultation.length > 0) {
    parts.push("", "## Previous Consultation Transcript");
    for (const turn of pending.consultation) {
      parts.push(
        `### ${turn.speaker === "developer" ? "Developer" : "Decision Partner"}`,
      );
      parts.push(turn.text, "");
    }
  }
  return parts.join("\n");
}

export function generateConsultationHook(
  socketPath: string,
  pending: PendingQuestion,
): string {
  const optionsText = pending.options
    .map(
      (o) =>
        `- ${safeTerminalText(o.label)}${o.description ? ` — ${safeTerminalText(o.description)}` : ""}`,
    )
    .join("\\n");
  const turnsText = pending.consultation
    .map(
      (t) =>
        `\\n${t.speaker === "developer" ? "You" : "Decision Partner"}:\\n${safeTerminalText(t.text)}`,
    )
    .join("\\n");

  return `import { AssistantMessageEventStream } from "@oh-my-pi/pi-ai/utils/event-stream";
import { createConnection } from "node:net";

export default function (pi) {
  const socket = createConnection(${JSON.stringify(socketPath)});
  socket.setEncoding("utf8");
  let replyResolve;
  let replyReject;
  let buffer = "";

  socket.on("data", (chunk) => {
    buffer += chunk.toString();
    while (true) {
      const idx = buffer.indexOf("\\n");
      if (idx < 0) break;
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (!frame.trim()) continue;
      try {
        const msg = JSON.parse(frame);
        if (msg.type === "response") {
          const fn = replyResolve;
          replyResolve = undefined;
          replyReject = undefined;
          fn?.(msg.text);
        } else if (msg.type === "error") {
          const fn = replyReject;
          replyResolve = undefined;
          replyReject = undefined;
          fn?.(new Error(msg.text ?? "Consultation error"));
        } else if (msg.type === "aborted") {
          process.exit(0);
        }
      } catch {}
    }
  });

  socket.on("close", () => process.exit(0));
  socket.on("error", () => process.exit(0));
  socket.write(JSON.stringify({ type: "ready" }) + "\\n");

  console.log("AGAD — Decision Partner (advisory only; not an answer or approval)");
  console.log("Pending question:\\n" + ${JSON.stringify(safeTerminalText(pending.question))});
  console.log("\\nOptions:\\n" + ${JSON.stringify(optionsText)});
  console.log("\\nContext:\\n" + ${JSON.stringify(safeTerminalText(pending.context))});
  ${pending.consultation.length ? `console.log("\\nPrivate consultation transcript:" + ${JSON.stringify(turnsText)});` : ""}
  console.log("\\nType /return to close this pane and return to the unchanged question.");

  pi.registerCommand("return", {
    description: "Close consultation and return to the unchanged question",
    handler: async () => {
      try { socket.write(JSON.stringify({ type: "return" }) + "\\n"); } catch {}
      process.exit(0);
    },
  });

  pi.registerProvider("agad-partner", {
    baseUrl: "http://localhost",
    apiKey: "dummy",
    api: "agad-partner-api",
    models: [
      {
        id: "partner",
        name: "Decision Partner",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 4096,
      },
    ],
    streamSimple: (model, context) => {
      const stream = new AssistantMessageEventStream();
      const userMsgs = (context.messages || []).filter((m) => m.role === "user");
      const lastUser = userMsgs[userMsgs.length - 1];
      let promptText = "";
      if (typeof lastUser?.content === "string") {
        promptText = lastUser.content;
      } else if (Array.isArray(lastUser?.content)) {
        promptText = lastUser.content
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join("\\n");
      }
      promptText = promptText.replace(/<system-reminder>[\\s\\S]*?<\\/system-reminder>\\s*/g, "").trim();
      const pendingReply = new Promise((resolve, reject) => {
        replyResolve = resolve;
        replyReject = reject;
      });
      socket.write(JSON.stringify({ type: "prompt", text: promptText }) + "\\n");
      void pendingReply.then(
        (reply) => {
          const msg = {
            role: "assistant",
            content: [{ type: "text", text: reply }],
            stopReason: "stop",
            usage: { inputTokens: 10, outputTokens: 10, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
          };
          stream.push({ type: "start", partial: msg });
          stream.push({ type: "text_start", contentIndex: 0, partial: msg });
          stream.push({ type: "text_delta", contentIndex: 0, delta: reply, partial: msg });
          stream.push({ type: "text_end", contentIndex: 0, content: reply, partial: msg });
          stream.push({ type: "done", reason: "stop", message: msg });
        },
        (err) => {
          stream.push({ type: "error", error: err instanceof Error ? err.message : String(err) });
        },
      );
      return stream;
    },
  });
}
`;
}

type PaneMessage =
  | { type: "ready" }
  | { type: "prompt"; text: string }
  | { type: "return" }
  | { type: "closed" }
  | { type: "aborted" };

export interface ConsultationPanePort {
  partner(prompt: string, signal?: AbortSignal): Promise<string>;
  save(): void;
  current?(): void;
}

export type PaneResult = { opened: boolean; reason?: string };

function tmuxContext() {
  const pane = process.env.TMUX_PANE;
  if (!process.env.TMUX || !pane || !/^%\d+$/.test(pane))
    return {
      reason:
        "Not running in a tmux pane; consultation will use OMP's native dialogs, not a split pane.",
    };
  const executable = Bun.which("tmux");
  if (!executable)
    return {
      reason:
        "The tmux executable is unavailable; consultation will use OMP's native dialogs, not a split pane.",
    };
  const runtime =
    Bun.which("bun") ??
    (/\/bun(?:-debug)?$/.test(process.execPath) ? process.execPath : undefined);
  if (!runtime)
    return {
      reason:
        "The Bun runtime executable is unavailable; consultation will use OMP's native dialogs, not a split pane.",
    };
  return { executable, pane, runtime };
}

function send(socket: Socket | undefined, message: Record<string, unknown>) {
  if (!socket || socket.destroyed) return;
  const frame = `${JSON.stringify(message)}\n`;
  if (Buffer.byteLength(frame, "utf8") > MAX_FRAME_BYTES) {
    socket.destroy();
    return;
  }
  socket.write(frame);
}

async function invokeTmux(argv: string[], signal?: AbortSignal) {
  signal?.throwIfAborted();
  const child = Bun.spawn(argv, {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  let stop!: (reason: unknown) => void;
  const stopped = new Promise<never>((_resolve, reject) => {
    stop = (reason) => {
      child.kill("SIGKILL");
      reject(reason);
    };
  });
  const abort = () => stop(signal?.reason);
  const timer = setTimeout(
    () => stop(new Error("tmux command timed out")),
    5000,
  );
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  try {
    const [stdout, stderr, exitCode] = await Promise.race([
      Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]),
      stopped,
    ]);
    return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

function paneInit(pending: PendingQuestion, briefPath?: string) {
  return {
    type: "init",
    question: pending.question,
    context: pending.context,
    options: pending.options,
    turns: pending.consultation,
    briefPath,
  };
}

export async function runTmuxConsultation(
  pending: PendingQuestion,
  port: ConsultationPanePort,
  signal?: AbortSignal,
  enabled = true,
): Promise<PaneResult> {
  if (!enabled)
    return {
      opened: false,
      reason:
        "tmux consultation is disabled for this dialog; using OMP's native dialogs, not a split pane.",
    };
  const tmux = tmuxContext();
  if ("reason" in tmux) return { opened: false, reason: tmux.reason };
  if (signal?.aborted)
    return { opened: false, reason: "Consultation was cancelled." };
  if (
    Buffer.byteLength(JSON.stringify(paneInit(pending)), "utf8") >
    MAX_FRAME_BYTES
  )
    return {
      opened: false,
      reason:
        "The pending question and consultation transcript exceed the tmux pane's 2 MiB IPC limit; using OMP's native dialogs, not a split pane.",
    };

  let directory: string | undefined;
  let server: Server | undefined;
  let socket: Socket | undefined;
  let paneId: string | undefined;
  let closed = false;
  const closing = new AbortController();
  const queue: PaneMessage[] = [];
  let wake: (() => void) | undefined;
  const enqueue = (message: PaneMessage) => {
    if (queue.length >= 32) {
      socket?.destroy();
      return;
    }
    queue.push(message);
    wake?.();
    wake = undefined;
  };
  const nextMessage = async () => {
    while (!queue.length)
      await new Promise<void>((resolve) => (wake = resolve));
    return queue.shift()!;
  };
  const markClosed = () => {
    if (closed) return;
    closed = true;
    enqueue({ type: "closed" });
    closing.abort(new Error("Consultation pane closed"));
  };
  const onAbort = () => {
    send(socket, { type: "aborted" });
    enqueue({ type: "aborted" });
    closing.abort(signal?.reason);
  };

  try {
    if (signal?.aborted)
      return { opened: false, reason: "Consultation was cancelled." };
    directory = await mkdtemp(join(tmpdir(), "agad-"));
    await chmod(directory, 0o700);
    const socketPath = join(directory, "s");
    const briefPath = join(directory, "consultation-brief.md");
    await writeFile(briefPath, generateConsultationMarkdown(pending), "utf8");
    await chmod(briefPath, 0o600);
    server = createServer((client) => {
      if (socket) {
        client.destroy();
        return;
      }
      const activeSocket = client;
      socket = activeSocket;
      activeSocket.setEncoding("utf8");
      let buffer = "";
      activeSocket.on("data", (chunk: string) => {
        buffer += chunk;
        while (true) {
          const newline = buffer.indexOf("\n");
          if (newline < 0) {
            if (Buffer.byteLength(buffer, "utf8") > MAX_FRAME_BYTES)
              activeSocket.destroy();
            return;
          }
          const frame = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          if (Buffer.byteLength(frame, "utf8") > MAX_FRAME_BYTES) {
            activeSocket.destroy();
            return;
          }
          try {
            const message = JSON.parse(frame);
            if (message?.type === "ready") enqueue({ type: "ready" });
            else if (message?.type === "return") enqueue({ type: "return" });
            else if (
              message?.type === "prompt" &&
              typeof message.text === "string"
            )
              enqueue({ type: "prompt", text: message.text });
            else
              send(activeSocket, {
                type: "error",
                text: "Invalid consultation message.",
              });
          } catch {
            activeSocket.destroy();
            return;
          }
        }
      });
      activeSocket.on("close", markClosed);
      activeSocket.on("error", markClosed);
      send(activeSocket, paneInit(pending, briefPath));
    });
    await new Promise<void>((resolve, reject) => {
      server!.once("error", reject);
      server!.listen(socketPath, resolve);
    });
    await chmod(socketPath, 0o600);

    const hookPath = join(directory, "consultation-hook.ts");
    await writeFile(
      hookPath,
      generateConsultationHook(socketPath, pending),
      "utf8",
    );
    await chmod(hookPath, 0o600);

    const ompBin =
      process.env.AGAD_CONSULT_BACKEND === "script"
        ? undefined
        : (Bun.which("omp") ??
          (existsSync("/Users/vkwhm/.local/bin/omp")
            ? "/Users/vkwhm/.local/bin/omp"
            : undefined));

    const runner = ompBin
      ? [
          ompBin,
          "--no-extensions",
          "--no-prewalk",
          "--no-title",
          "--tools",
          "read,grep,glob",
          "--hook",
          hookPath,
          "--model",
          "agad-partner/partner",
          "--append-system-prompt",
          briefPath,
        ]
      : [tmux.runtime, PANE_SCRIPT];

    const split = await invokeTmux(
      [
        tmux.executable,
        "split-window",
        "-h",
        "-p",
        "38",
        "-P",
        "-F",
        "#{pane_id}",
        "-t",
        tmux.pane,
        "-e",
        `AGAD_CONSULT_SOCKET=${socketPath}`,
        "-e",
        `AGAD_CONSULT_BRIEF=${briefPath}`,
        "--",
        ...runner,
      ],
      signal,
    );
    if (split.exitCode !== 0 || !/^%\d+$/.test(split.stdout)) {
      const detail =
        split.stderr || split.stdout || `tmux exited ${split.exitCode}`;
      return {
        opened: false,
        reason: `Could not open the tmux consultation pane (${detail}); using OMP's native dialogs, not a split pane.`,
      };
    }
    paneId = split.stdout;
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
    const startup = await new Promise<PaneMessage>((resolve) => {
      const timer = setTimeout(() => resolve({ type: "closed" }), 5000);
      void nextMessage().then((message) => {
        clearTimeout(timer);
        resolve(message);
      });
    });
    if (startup.type !== "ready")
      return {
        opened: false,
        reason:
          "The tmux consultation process did not connect within five seconds; using OMP's native dialogs, not a split pane.",
      };
    while (!signal?.aborted && !closed) {
      const message = await nextMessage();
      if (signal?.aborted || closed) break;
      if (message.type === "ready") continue;
      if (
        message.type === "closed" ||
        message.type === "return" ||
        message.type === "aborted"
      )
        break;
      if (message.type !== "prompt" || !message.text.trim()) continue;
      if (Buffer.byteLength(message.text, "utf8") > MAX_PROMPT_BYTES) {
        send(socket, {
          type: "error",
          text: "That message is too long (32 KiB maximum).",
        });
        continue;
      }
      port.current?.();
      pending.consultation.push({ speaker: "developer", text: message.text });
      port.save();

      const partnerAbort = new AbortController();
      let closePartner!: () => void;
      const stopped = new Promise<{ kind: "closed" }>((resolve) => {
        closePartner = () => {
          partnerAbort.abort(closing.signal.reason);
          resolve({ kind: "closed" });
        };
        closing.signal.addEventListener("abort", closePartner, { once: true });
        if (closing.signal.aborted) closePartner();
      });
      const partnerPromise = Promise.resolve()
        .then(() => {
          partnerAbort.signal.throwIfAborted();
          return port.partner(message.text, partnerAbort.signal);
        })
        .then(
          (text) => ({ kind: "response" as const, text }),
          (error: unknown) => ({ kind: "error" as const, error }),
        );
      const finished = await Promise.race([partnerPromise, stopped]);
      closing.signal.removeEventListener("abort", closePartner);
      if (finished.kind === "closed" || signal?.aborted || closed) break;
      if (finished.kind === "error") {
        send(socket, {
          type: "error",
          text:
            finished.error instanceof Error
              ? finished.error.message
              : String(finished.error),
        });
        continue;
      }
      port.current?.();
      if (signal?.aborted || closed) break;
      pending.consultation.push({ speaker: "partner", text: finished.text });
      port.save();
      send(socket, { type: "response", text: finished.text });
    }

    return { opened: true };
  } catch (error) {
    if (paneId)
      return {
        opened: true,
        reason: error instanceof Error ? error.message : String(error),
      };
    return {
      opened: false,
      reason: `Could not start the tmux consultation pane (${error instanceof Error ? error.message : String(error)}); using OMP's native dialogs, not a split pane.`,
    };
  } finally {
    signal?.removeEventListener("abort", onAbort);
    if (paneId) {
      try {
        await invokeTmux([tmux.executable, "kill-pane", "-t", paneId]);
      } catch {
        // The user may already have closed the pane; its socket is authoritative.
      }
    }
    socket?.destroy();
    if (server) {
      try {
        await new Promise<void>((resolve) => server!.close(() => resolve()));
      } catch {
        // A listen failure already left no server handle to close.
      }
    }
    if (directory) await rm(directory, { recursive: true, force: true });
  }
}

if (import.meta.main) await runConsultationPane();

interface InitMessage {
  type: "init";
  question: string;
  context: string;
  options: PendingQuestion["options"];
  turns: PendingQuestion["consultation"];
  briefPath?: string;
}

async function runConsultationPane() {
  const socketPath = process.env.AGAD_CONSULT_SOCKET;
  if (!socketPath) {
    process.stderr.write("AGAD consultation connection is missing.\n");
    process.exitCode = 1;
    return;
  }
  const socket = createConnection(socketPath);
  socket.setEncoding("utf8");
  let buffer = "";
  let initResolve!: (value: InitMessage | undefined) => void;
  const init = new Promise<InitMessage | undefined>(
    (resolve) => (initResolve = resolve),
  );
  let replyResolve:
    ((value: { type: string; text?: string }) => void) | undefined;
  const sendChild = (message: Record<string, unknown>) => {
    if (!socket.destroyed) socket.write(`${JSON.stringify(message)}\n`);
  };
  socket.on("data", (chunk: string) => {
    buffer += chunk;
    while (true) {
      const newline = buffer.indexOf("\n");
      if (newline < 0) {
        if (Buffer.byteLength(buffer, "utf8") > MAX_FRAME_BYTES)
          socket.destroy();
        return;
      }
      const frame = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (Buffer.byteLength(frame, "utf8") > MAX_FRAME_BYTES) {
        socket.destroy();
        return;
      }
      try {
        const message = JSON.parse(frame);
        if (message?.type === "init") initResolve(message as InitMessage);
        else if (["response", "error", "aborted"].includes(message?.type))
          replyResolve?.(message);
      } catch {
        socket.destroy();
      }
    }
  });
  socket.on("connect", () => sendChild({ type: "ready" }));
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });
  const disconnected = () => {
    initResolve(undefined);
    replyResolve?.({ type: "aborted" });
    rl.close();
    socket.destroy();
  };
  socket.on("close", disconnected);
  socket.on("error", disconnected);
  const initial = await init;
  if (!initial) {
    rl.close();
    return;
  }
  console.log(
    "AGAD — Decision Partner (advisory only; not an answer or approval)",
  );
  console.log("Pending question:");
  console.log(safeTerminalText(initial.question));
  console.log("\nOptions:");
  for (const option of initial.options)
    console.log(
      `- ${safeTerminalText(option.label)}${option.description ? ` — ${safeTerminalText(option.description)}` : ""}`,
    );
  console.log("\nContext:");
  console.log(safeTerminalText(initial.context));
  if (initial.turns.length) {
    console.log("\nPrivate consultation transcript:");
    for (const turn of initial.turns) printTurn(turn.speaker, turn.text);
  }
  console.log(
    "\nType /return to close this pane and return to the unchanged question.",
  );
  console.log("Type /context to view the full consultation context brief.");
  try {
    while (!socket.destroyed) {
      const line = await askLine(rl, "\nYou> ");
      if (line === undefined || line.trim() === "/return") {
        sendChild({ type: "return" });
        break;
      }
      if (line.trim() === "/context") {
        let briefText = "";
        const briefPath = process.env.AGAD_CONSULT_BRIEF ?? initial.briefPath;
        if (briefPath) {
          try {
            briefText = await Bun.file(briefPath).text();
          } catch {}
        }
        if (!briefText) {
          briefText = generateConsultationMarkdown({
            id: "",
            question: initial.question,
            context: initial.context,
            options: initial.options,
            consultation: initial.turns,
          });
        }
        console.log(`\n${briefText}\n`);
        continue;
      }
      if (line.trim() === "/help") {
        console.log("\nCommands:");
        console.log(
          "  /return   Return to the main Architect window to answer the question",
        );
        console.log(
          "  /context  Display the generated markdown consultation brief",
        );
        console.log("  /help     Show this help");
        continue;
      }
      if (!line.trim()) continue;
      if (Buffer.byteLength(line, "utf8") > MAX_PROMPT_BYTES) {
        console.log(
          "That message is too long (32 KiB maximum); it was not sent.",
        );
        continue;
      }
      process.stdout.write(`\nYou: ${safeTerminalText(line)}\n`);
      const pendingReply = new Promise<{ type: string; text?: string }>(
        (resolve) => {
          replyResolve = resolve;
        },
      );
      sendChild({ type: "prompt", text: line });
      const result = await pendingReply;
      if (result.type === "aborted") break;
      if (result.type === "error") {
        console.log(
          `\nConsultation error: ${safeTerminalText(result.text ?? "Unknown error")}`,
        );
        continue;
      }
      printTurn("partner", result.text ?? "");
    }
  } finally {
    rl.close();
    socket.end();
  }
}

function askLine(rl: Interface, prompt: string) {
  if (rl.closed) return Promise.resolve(undefined);
  return new Promise<string | undefined>((resolve) => {
    const onClose = () => resolve(undefined);
    rl.once("close", onClose);
    rl.question(prompt, (answer) => {
      rl.off("close", onClose);
      resolve(answer);
    });
  });
}

function printTurn(speaker: "developer" | "partner", text: string) {
  console.log(`\n${speaker === "developer" ? "You" : "Decision Partner"}:`);
  console.log(safeTerminalText(text));
}

function safeTerminalText(value: string) {
  return value
    .replace(/\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))/g, "")
    .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "");
}
