import type { Json } from "./types.ts";

// None of this weakens the core. Binding fills only facts the host already owns
// (current revision, candidate, delivery/report IDs); the core still validates
// every resulting event, and human approval content is never invented here.

const bindsCurrent = new Set([
  "request_repair",
  "request_test_correction",
  "provisionally_approve",
  "approve_test_gap",
  "accept",
  "waive_business_review",
]);
const bindsCandidate = new Set([
  "request_repair",
  "request_test_correction",
  "provisionally_approve",
  "approve_test_gap",
  "accept",
  "waive_business_review",
]);

export interface HostFacts {
  revision?: number;
  candidate?: string;
  findingCount?: number;
  verification?: { delivery: string; report: string };
}

/** Fill host-owned binding fields the model omitted. Never overrides model-supplied values. */
export function bindEvent(event: Json, facts: HostFacts): Json {
  const bound: Json = { ...event };
  const type = String(event.type);
  if (bindsCurrent.has(type) && bound.revision === undefined && facts.revision !== undefined)
    bound.revision = facts.revision;
  if (bindsCandidate.has(type) && bound.candidate === undefined && facts.candidate !== undefined)
    bound.candidate = facts.candidate;
  if (
    ["provisionally_approve", "waive_business_review"].includes(type) &&
    bound.presented_by === undefined
  )
    bound.presented_by = "architect";
  if (type === "provisionally_approve" && bound.dispositions === undefined && facts.findingCount === 0)
    bound.dispositions = {};
  if (type === "accept" && facts.verification) {
    bound.delivery ??= facts.verification.delivery;
    bound.report ??= facts.verification.report;
  }
  return bound;
}

/** Extract one JSON object from a worker reply, tolerating fences and surrounding prose. */
export function extractJsonObject(output: string): Json {
  const trimmed = output.trim();
  const candidates = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) candidates.push(fenced[1].trim());
  const start = trimmed.indexOf("{"),
    end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(trimmed.slice(start, end + 1));
  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate);
      if (value && typeof value === "object" && !Array.isArray(value)) return value;
    } catch {}
  }
  throw new Error(
    `Worker did not return a single JSON object. Raw output (first 600 chars): ${trimmed.slice(0, 600)}`,
  );
}

// Fields the host binds; a worker-supplied value would be ignored or conflict.
const hostOwned = [
  "type",
  "actor",
  "revision",
  "candidate",
  "checks",
  "delivery",
  "report",
  "decision",
  "source",
];

/** Drop host-owned fields and coerce structured evidence into the string the core requires. */
export function normalizeReport(report: Json): Json {
  const clean: Json = { ...report };
  for (const key of hostOwned) delete clean[key];
  for (const key of ["evidence", "scenario_basis", "reason"])
    if (clean[key] !== undefined && typeof clean[key] !== "string" && clean[key] !== null)
      clean[key] = JSON.stringify(clean[key]);
  return clean;
}

export const reportSkeletons: Record<string, string> = {
  implementer:
    '{"outcomes":["R1"],"evidence":"<what changed, with paths>","delegated_choices":{}}',
  business_reviewer:
    '{"alignment":"aligned|misaligned|uncertain","review_order":"scenarios_then_implementation","scenario_basis":"<approved requirement evidence>","evidence":"<non-empty: scenarios derived and files inspected>","findings":[]}',
  test_engineer:
    '{"status":"pass|fail|blocked","covered":["R1"],"gaps":{},"evidence":"<non-empty>","reason":"<required for fail/blocked>"}',
};

const hints: Array<[RegExp, (c: HintContext) => string]> = [
  [/Role report needs evidence/, (c) => `Worker JSON must contain a non-empty string "evidence". Expected shape: ${reportSkeletons[c.role ?? "business_reviewer"]}`],
  [/Repair needs defect evidence|Test correction needs evidence/, (c) => `Send {"type":"${c.type ?? "request_repair"}","reason":"...","changes_business_semantics":false,"outcomes":${JSON.stringify(c.outcomes ?? ["R1"])},"evidence":"<concrete defect/stale-candidate evidence>"}. "outcomes" must be a nonempty subset of the approved IDs; revision and candidate are bound by the host.`],
  [/Business changes require dialogue|New expected behavior requires dialogue/, () => 'changes_business_semantics must be the boolean false. If business meaning changed, use "revise" and ask the Developer instead.'],
  [/requires (\w+), found (\w+)/, () => "The workflow is not in the required phase. Call agad_status and follow its Next step; do not retry the same call."],
  [/Stale contract revision|Stale or missing candidate|Checkpoint refers to stale candidate|Production changed after implementation/, () => 'The candidate is stale. Record {"type":"request_repair",...} (same business meaning) or "revise", obtain a fresh submit_implementation, and only then re-present approval.'],
  [/Repair requires Architect/, () => "Repair needs an existing candidate. Before implementation, use revise or delegate the implementer."],
  [/Every finding needs a developer disposition/, () => "provisionally_approve.dispositions must have exactly one entry per review finding ID: {action: resolved|excluded|accepted_risk, reason, evidence|revisit}."],
  [/Human code review required/, () => 'accept requires a non-empty "code_review" string summarising what the Developer reviewed.'],
];

export interface HintContext {
  phase?: string;
  role?: string;
  type?: string;
  outcomes?: string[];
}

/** Append recovery guidance so a rejected call can be corrected rather than guessed at again. */
export function explainRejection(error: unknown, context: HintContext): Error {
  const message = error instanceof Error ? error.message : String(error);
  const hint = hints.find(([pattern]) => pattern.test(message));
  const parts = [message];
  if (context.phase) parts.push(`Current phase: ${context.phase}.`);
  if (hint) parts.push(`How to fix: ${hint[1](context)}`);
  parts.push("Do not resend the identical call; correct the cause or ask the Developer.");
  return new Error(parts.join("\n"));
}

// Typed tool arguments -> core events. Only fields relevant to the type are kept, so a
// stray field cannot smuggle authority; the core still validates the final event.
const nonEmpty = (v: unknown) => typeof v === "string" && v.trim() !== "";
const present = (v: unknown) =>
  Array.isArray(v) ? v.length > 0 : typeof v === "boolean" ? true : nonEmpty(v) || (v !== null && typeof v === "object");

const eventFields: Record<string, { required: string[]; optional?: string[] }> = {
  revise: { required: ["reason"] },
  resume: { required: ["reason"] },
  block: { required: ["reason", "owner", "next_action"] },
  request_repair: {
    required: ["reason", "changes_business_semantics", "outcomes", "evidence"],
  },
  request_test_correction: {
    required: ["reason", "changes_business_semantics", "outcomes", "evidence"],
  },
  provisionally_approve: { required: [], optional: ["dispositions"] },
  accept: { required: ["code_review"] },
  waive_business_review: {
    required: ["reason", "no_business_change", "no_architecture_change"],
  },
  approve_test_gap: { required: ["outcomes", "reason", "impact", "revisit"] },
  cancel: { required: ["reason"] },
};

export function buildEvent(args: Json, allowed: string[]): Json {
  const type = String(args.type);
  const spec = eventFields[type];
  if (!allowed.includes(type) || !spec)
    throw new Error(`Unsupported event type "${type}". Allowed: ${allowed.join(", ")}.`);
  const missing = spec.required.filter((key) => !present(args[key]));
  if (missing.length)
    throw new Error(
      `Event "${type}" is missing required field(s): ${missing.join(", ")}.`,
    );
  const event: Json = { type };
  for (const key of [...spec.required, ...(spec.optional ?? [])])
    if (args[key] !== undefined && args[key] !== null) event[key] = args[key];
  return event;
}
