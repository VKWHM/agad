import type { Role } from "./roles.ts";

export const AGAD_WORKER_ENTRY = "agad.worker-session";

export type WorkerStatus = "running" | "success" | "error" | "aborted";

export interface WorkerSessionReference {
  workerId: string;
  role: Exclude<Role, "architect">;
  sessionId: string;
  sessionFile: string;
  parentAgentId: string;
  parentSessionFile?: string;
  status: WorkerStatus;
}

const WORKER_ROLES: Record<Exclude<Role, "architect">, true> = {
  scout: true,
  implementer: true,
  business_reviewer: true,
  test_engineer: true,
  decision_partner: true,
};
const WORKER_STATUSES: Record<WorkerStatus, true> = {
  running: true,
  success: true,
  error: true,
  aborted: true,
};

function isWorkerSessionReference(
  value: unknown,
): value is WorkerSessionReference {
  if (!value || typeof value !== "object") return false;
  if (
    !("workerId" in value) ||
    !("role" in value) ||
    !("sessionId" in value) ||
    !("sessionFile" in value) ||
    !("parentAgentId" in value) ||
    !("status" in value)
  )
    return false;
  const parentSessionFile =
    "parentSessionFile" in value ? value.parentSessionFile : undefined;
  return (
    typeof value.workerId === "string" &&
    typeof value.role === "string" &&
    Object.hasOwn(WORKER_ROLES, value.role) &&
    typeof value.sessionId === "string" &&
    typeof value.sessionFile === "string" &&
    typeof value.parentAgentId === "string" &&
    (parentSessionFile === undefined ||
      typeof parentSessionFile === "string") &&
    typeof value.status === "string" &&
    Object.hasOwn(WORKER_STATUSES, value.status)
  );
}

export function latestWorkerReferences(
  entries: readonly unknown[],
): WorkerSessionReference[] {
  const latest = new Map<string, WorkerSessionReference>();
  for (const entry of entries) {
    if (
      !entry ||
      typeof entry !== "object" ||
      !("type" in entry) ||
      !("customType" in entry) ||
      !("data" in entry) ||
      entry.type !== "custom" ||
      entry.customType !== AGAD_WORKER_ENTRY ||
      !isWorkerSessionReference(entry.data)
    )
      continue;
    latest.set(entry.data.workerId, entry.data);
  }
  return [...latest.values()];
}

export function formatWorkerReferences(
  references: readonly WorkerSessionReference[],
): string {
  if (references.length === 0)
    return "No AGAD worker sessions in this OMP history.";
  return references
    .map(
      (worker) =>
        `${worker.role} — ${worker.status} (${worker.sessionId})\n` +
        `  Session: ${worker.sessionFile}\n` +
        `  Parent: ${worker.parentAgentId}${worker.parentSessionFile ? ` — ${worker.parentSessionFile}` : ""}`,
    )
    .join("\n");
}
