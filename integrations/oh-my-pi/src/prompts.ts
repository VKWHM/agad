import { readFile } from "node:fs/promises";
import type { Role } from "./roles.ts";
export async function rolePrompt(role: Role) {
  const content = await readFile(
    new URL(`../agents/${role.replaceAll("_", "-")}.md`, import.meta.url),
    "utf8",
  );
  return content.split("---").slice(2).join("---").trim();
}
