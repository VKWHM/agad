import { fileURLToPath } from "node:url";
import type { Json } from "./types.ts";
const bridge = fileURLToPath(
  new URL("../scripts/core_bridge.py", import.meta.url),
);
export async function validate(record: Json): Promise<string> {
  const child = Bun.spawn(["python3", bridge], {
    stdin: new Blob([JSON.stringify(record)]),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) throw new Error(`Core rejected record: ${err.trim()}`);
  return JSON.parse(out).phase;
}
export async function append(record: Json, event: Json) {
  const next = structuredClone(record);
  next.events.push(structuredClone(event));
  return { record: next, phase: await validate(next) };
}
