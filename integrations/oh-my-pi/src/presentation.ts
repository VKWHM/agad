import type { Json, PendingQuestion } from "./types.ts";

export interface CheckpointPresentation {
  title: string;
  summary: string;
  details: string;
}

const checkpointNames: Record<string, string> = {
  approve_contract: "Contract approval",
  waive_business_review: "Business review waiver",
  provisionally_approve: "Provisional approval",
  approve_test_gap: "Test gap approval",
  accept: "Final acceptance",
  cancel: "Change cancellation",
};

function heading(key: string) {
  const words = key.replace(/[_-]/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// Every key and scalar retains its exact JSON spelling alongside readable headings.
// Indexed array entries preserve order, boundaries and exact argv (not shell syntax).
function fields(value: unknown, title: string, depth = 0): string[] {
  const indent = "  ".repeat(depth);
  const lines = [`${indent}${title}`];
  if (value !== null && typeof value === "object") {
    const entries = Array.isArray(value)
      ? value.map((item, index) => [String(index), item] as const)
      : Object.entries(value);
    lines.push(`${indent}  ${Array.isArray(value) ? `Ordered array (${entries.length} entries)` : `Object (${entries.length} fields)`}`);
    for (const [key, item] of entries) {
      const label = Array.isArray(value)
        ? `Entry [${key}]`
        : `${heading(key)} — field ${JSON.stringify(key)}`;
      lines.push(...fields(item, label, depth + 1));
    }
  } else {
    lines.push(`${indent}  Value: ${JSON.stringify(value) ?? "undefined (not present)"}`);
  }
  return lines;
}

function concise(value: unknown) {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/\s+/g, " ").trim();
  return text ? (text.length > 650 ? `${text.slice(0, 650)}…` : text) : undefined;
}

// Summaries describe the authority of the event, not the overall feature.
// Only supplied values are summarized; the complete payload remains in details.
function checkpointSummary(event: Json, contract: Json): string[] {
  const lines: string[] = [];
  const value = (label: string, data: unknown) => {
    if (data !== undefined)
      lines.push(`${label}: ${concise(typeof data === "string" ? data : JSON.stringify(data)) ?? "(empty)"}`);
  };
  switch (event.type) {
    case "approve_contract":
      lines.push("Approve authorizes implementation of the specified contract outcomes within the proposed production/test scope and approved checks; it is not testing authorization or final acceptance.");
      value("Intended outcomes", contract.teach_back ?? contract.intent ?? event.teach_back);
      break;
    case "waive_business_review":
      lines.push("Approve waives only Business Reviewer review for this exact candidate of a trivial technical change. It does not authorize testing or final acceptance.");
      value("Rationale", event.reason);
      value("No business change", event.no_business_change);
      value("No architecture change", event.no_architecture_change);
      break;
    case "provisionally_approve":
      lines.push("Approve authorizes test writing and execution for this exact candidate with the supplied finding dispositions. It is not final acceptance.");
      if (event.dispositions && typeof event.dispositions === "object") {
        const entries = Object.entries(event.dispositions);
        if (!entries.length) lines.push("Finding dispositions: none supplied (empty set).");
        for (const [id, disposition] of entries) {
          lines.push(`Finding ${id}:`);
          if (disposition && typeof disposition === "object") {
            const item = disposition as Json;
            value("  Action", item.action);
            value("  Reason", item.reason);
            value("  Evidence", item.evidence);
            value("  Revisit", item.revisit);
          } else value("  Disposition", disposition);
        }
      }
      break;
    case "approve_test_gap":
      lines.push("Approve waives only test coverage for the affected outcomes below on this exact candidate, not feature behavior, invariant coverage or mandatory checks. It is not final acceptance.");
      // Outcome IDs define the waiver's scope: do not clip this list.
      lines.push(`Affected outcomes: ${event.outcomes === undefined ? "not supplied; consult Architect" : JSON.stringify(event.outcomes)}`);
      value("Reason", event.reason);
      value("Impact", event.impact);
      value("Revisit trigger", event.revisit);
      break;
    case "accept":
      lines.push("Approve grants final acceptance of this exact candidate, tested delivery and report after human code review.");
      value("Delivery", event.delivery);
      value("Report", event.report);
      value("Human code review", event.code_review);
      break;
    case "cancel":
      lines.push("Approve stops this change in the terminal cancelled state. It does not authorize delivery of the feature or grant acceptance.");
      value("Reason", event.reason);
      break;
    default:
      lines.push("Checkpoint authority is unknown to this presentation. Do not infer implementation, testing, waiver or acceptance authority; review full details and clarify with Architect before deciding.");
      value("Event type", event.type);
  }
  value("Revision", event.revision);
  value("Candidate", event.candidate);
  return lines;
}

export function checkpointPresentation(payload: Json): CheckpointPresentation {
  const event = payload.event ?? {};
  const contract = payload.contract ?? {};
  const title = checkpointNames[event.type] ?? "Human checkpoint";
  return {
    title,
    summary: [
      ...checkpointSummary(event, contract),
      "Request changes or type an answer otherwise. Only explicit Approve submits this event.",
      "Review full details for all exact values, the complete contract, production/test scope, exact check argv and checkpoint evidence. Summary values may be shortened; viewing or editing details is not approval.",
    ].join("\n\n"),
    details: [
      `${title} — full original approval payload`,
      "Read-only in authority: editor changes are discarded. Close to return to the same pending question. Only explicit Approve authorizes the checkpoint.",
      "All original fields follow, including unknown fields. String values and field keys are quoted with JSON escaping to preserve exact whitespace and characters. Arrays are ordered and indexed from zero; check argv entries are exact arguments, not a shell command. Production and test paths are listed separately under Scope when supplied.",
      ...fields(payload, "Original approval payload"),
    ].join("\n\n"),
  };
}

// Old saved questions have only the original JSON context. Derive a view without
// rewriting that context or inventing omitted contract/scope/evidence fields.
export function pendingPresentation(pending: PendingQuestion): CheckpointPresentation | undefined {
  if (!pending.event) return undefined;
  try {
    const payload: unknown = JSON.parse(pending.context);
    if (payload && typeof payload === "object" && !Array.isArray(payload))
      return checkpointPresentation(payload as Json);
  } catch {
    // Preserve opaque legacy context verbatim as a labeled string in full details.
  }
  return checkpointPresentation({
    event: pending.event,
    ...(pending.scope ? { scope: pending.scope } : {}),
    original_context: pending.context,
  });
}
