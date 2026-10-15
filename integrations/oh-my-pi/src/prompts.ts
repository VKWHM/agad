import { readFile } from "node:fs/promises";
import type { Role } from "./roles.ts";
export async function rolePrompt(role: Role) {
  const content = await readFile(
    new URL(`../agents/${role.replaceAll("_", "-")}.md`, import.meta.url),
    "utf8",
  );
  return content.split("---").slice(2).join("---").trim();
}

// Prose is for reasoning; fenced JSON retains exact authoritative values.
// This is a presentation format, not a parser or a trust boundary.
export function markdownBrief(
  task: string,
  sections: Record<string, unknown>,
  instruction: string,
) {
  const parts = [`# Task\n\n${task}`, `# Instructions\n\n${instruction}`];
  for (const [title, value] of Object.entries(sections)) {
    if (value === undefined) continue;
    const text = typeof value === "string" ? value : JSON.stringify(value);
    let fenceLength = 3;
    for (const match of text.matchAll(/`+/g))
      fenceLength = Math.max(fenceLength, match[0].length + 1);
    const fence = "`".repeat(fenceLength);
    parts.push(`## ${title}\n\n${fence}${typeof value === "string" ? "text" : "json"}\n${text}\n${fence}`);
  }
  return parts.join("\n\n");
}
