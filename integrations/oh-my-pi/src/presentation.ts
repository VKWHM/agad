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

function concise(value: unknown, maxLen = 650) {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/\s+/g, " ").trim();
  return text ? (text.length > maxLen ? `${text.slice(0, maxLen)}…` : text) : undefined;
}

// Rich, human-readable summary for the interactive approving dialog
function checkpointSummary(payload: Json): string[] {
  const lines: string[] = [];
  const event = (payload.event ?? {}) as Json;
  const contract = (payload.contract ?? {}) as Json;
  const scope = (payload.scope ?? {}) as Json;

  const value = (label: string, data: unknown) => {
    if (data !== undefined)
      lines.push(`${label}: ${concise(typeof data === "string" ? data : JSON.stringify(data)) ?? "(empty)"}`);
  };

  switch (event.type) {
    case "approve_contract": {
      lines.push(
        "Approve authorizes implementation of the specified contract outcomes within the proposed production/test scope and approved checks; it is not testing authorization or final acceptance.",
      );
      if (contract.intent) lines.push(`Intent: ${contract.intent}`);
      if (contract.rationale && contract.rationale !== contract.intent)
        lines.push(`Rationale: ${contract.rationale}`);
      if (contract.change_type || contract.risk) {
        const parts = [
          contract.change_type ? `Change type: ${contract.change_type}` : "",
          contract.risk ? `Risk: ${contract.risk}` : "",
        ].filter(Boolean);
        lines.push(parts.join(" | "));
      }
      value("Teach back (intended outcomes)", contract.teach_back ?? contract.intent ?? event.teach_back);
      if (Array.isArray(scope?.production) && scope.production.length) {
        const prod = scope.production as string[];
        const preview = prod.slice(0, 5).map((p) => `  • ${p}`).join("\n");
        const more = prod.length > 5 ? `\n  ... and ${prod.length - 5} more files` : "";
        lines.push(`Production scope (${prod.length} files):\n${preview}${more}`);
      }
      if (Array.isArray(scope?.tests) && scope.tests.length) {
        const tests = scope.tests as string[];
        const preview = tests.slice(0, 5).map((p) => `  • ${p}`).join("\n");
        const more = tests.length > 5 ? `\n  ... and ${tests.length - 5} more files` : "";
        lines.push(`Test scope (${tests.length} files):\n${preview}${more}`);
      }
      const allChecks = scope?.checks ?? payload?.checks;
      if (allChecks && typeof allChecks === "object" && Object.keys(allChecks).length) {
        lines.push(
          "Approved checks:\n" +
            Object.entries(allChecks)
              .map(([id, argv]: [string, any]) => `  • ${id}: ${Array.isArray(argv) ? argv.join(" ") : String(argv)}`)
              .join("\n"),
        );
      }
      break;
    }
    case "waive_business_review": {
      lines.push(
        "Approve waives only Business Reviewer review for this exact candidate of a trivial technical change. It does not authorize testing or final acceptance.",
      );
      value("Rationale", event.reason);
      value("No business change", event.no_business_change);
      value("No architecture change", event.no_architecture_change);
      break;
    }
    case "provisionally_approve": {
      lines.push(
        "Approve authorizes test writing and execution for this exact candidate with the supplied finding dispositions. It is not final acceptance.",
      );
      if (event.reason) lines.push(`Reason: ${event.reason}`);
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
      if (Array.isArray(scope?.production) && scope.production.length) {
        lines.push(`Production candidate files: ${scope.production.join(", ")}`);
      }
      break;
    }
    case "approve_test_gap": {
      lines.push(
        "Approve waives only test coverage for the affected outcomes below on this exact candidate, not feature behavior, invariant coverage or mandatory checks. It is not final acceptance.",
      );
      lines.push(
        `Affected outcomes: ${event.outcomes === undefined ? "not supplied; consult Architect" : JSON.stringify(event.outcomes)}`,
      );
      value("Reason", event.reason);
      value("Impact", event.impact);
      value("Revisit trigger", event.revisit);
      break;
    }
    case "accept": {
      lines.push(
        "Approve grants final acceptance of this exact candidate, tested delivery and report after human code review.",
      );
      value("Delivery", event.delivery);
      value("Report", event.report);
      value("Human code review", event.code_review);
      break;
    }
    case "cancel": {
      lines.push(
        "Approve stops this change in the terminal cancelled state. It does not authorize delivery of the feature or grant acceptance.",
      );
      value("Reason", event.reason);
      break;
    }
    default: {
      lines.push(
        "Checkpoint authority is unknown to this presentation. Review full details and clarify with Architect before deciding.",
      );
      value("Event type", event.type);
    }
  }

  value("Revision", event.revision);
  value("Candidate", event.candidate);
  return lines;
}

function formatGenericValue(value: unknown, depth = 0): string {
  const indent = "  ".repeat(depth);
  if (value === null || value === undefined) return `${indent}Value: ${String(value)}`;
  if (typeof value !== "object") return `${indent}Value: ${JSON.stringify(value)}`;
  if (Array.isArray(value)) {
    return value
      .map((item, idx) => {
        if (typeof item === "object" && item !== null) {
          return `${indent}- [${idx}]:\n${formatGenericValue(item, depth + 1)}`;
        }
        return `${indent}- [${idx}]: ${JSON.stringify(item)}`;
      })
      .join("\n");
  }
  return Object.entries(value)
    .map(([k, v]) => {
      if (typeof v === "object" && v !== null) {
        return `${indent}- ${heading(k)} — field "${k}":\n${formatGenericValue(v, depth + 1)}`;
      }
      return `${indent}- ${heading(k)} — field "${k}": ${JSON.stringify(v)}`;
    })
    .join("\n");
}

function formatHumanReadableDetails(payload: Json, title: string): string {
  const lines: string[] = [];
  const event = (payload.event ?? {}) as Json;
  const contract = (payload.contract ?? {}) as Json;
  const scope = (payload.scope ?? {}) as Json;

  lines.push(`# ${title} — full original approval payload`);
  lines.push("");
  lines.push(
    "Read-only in authority: editor changes are discarded. Close to return to the same pending question. Only explicit Approve authorizes the checkpoint.",
  );
  lines.push(
    "All original fields follow, including unknown fields. String values and field keys are quoted with JSON escaping to preserve exact whitespace and characters. Arrays are ordered and indexed from zero; check argv entries are exact arguments, not a shell command. Production and test paths are listed separately under Scope when supplied.",
  );
  lines.push("");

  // 1. Checkpoint Event
  lines.push("## 1. Checkpoint Event — field \"event\"");
  lines.push(`- Type — field "type": ${JSON.stringify(event.type ?? "unknown")}`);
  if (event.actor) lines.push(`- Actor — field "actor": ${JSON.stringify(event.actor)}`);
  if (event.revision !== undefined) lines.push(`- Revision — field "revision": ${JSON.stringify(event.revision)}`);
  if (event.candidate !== undefined) lines.push(`- Candidate — field "candidate": ${JSON.stringify(event.candidate)}`);
  if (event.presented_by) lines.push(`- Presented by — field "presented_by": ${JSON.stringify(event.presented_by)}`);
  if (event.reason) lines.push(`- Reason — field "reason": ${JSON.stringify(event.reason)}`);
  if (event.impact) lines.push(`- Impact — field "impact": ${JSON.stringify(event.impact)}`);
  if (event.revisit) lines.push(`- Revisit trigger — field "revisit": ${JSON.stringify(event.revisit)}`);
  if (event.delivery) lines.push(`- Delivery — field "delivery": ${JSON.stringify(event.delivery)}`);
  if (event.report) lines.push(`- Report — field "report": ${JSON.stringify(event.report)}`);
  if (event.code_review) lines.push(`- Human code review — field "code_review": ${JSON.stringify(event.code_review)}`);
  if (event.outcomes) {
    lines.push(`- Outcomes — field "outcomes": ${JSON.stringify(event.outcomes)}`);
  }
  if (event.disposition && typeof event.disposition === "object") {
    lines.push(`- Disposition — field "disposition":\n${formatGenericValue(event.disposition, 1)}`);
  }
  if (event.dispositions && typeof event.dispositions === "object") {
    lines.push(`- Finding dispositions — field "dispositions":`);
    for (const [id, disp] of Object.entries(event.dispositions)) {
      lines.push(`  - Finding ${id}: ${typeof disp === "object" ? JSON.stringify(disp) : String(disp)}`);
    }
  }
  if (event.teach_back) {
    lines.push(`- Teach back — field "teach_back":\n  ${event.teach_back}`);
  }

  // 2. Living Domain Contract
  if (contract && Object.keys(contract).length) {
    lines.push("");
    lines.push("## 2. Living Domain Contract — field \"contract\"");
    if (contract.revision !== undefined) lines.push(`- Revision — field "revision": ${contract.revision}`);
    if (contract.intent) lines.push(`- Intent — field "intent": ${contract.intent}`);
    if (contract.rationale) lines.push(`- Rationale — field "rationale": ${contract.rationale}`);
    if (contract.risk) lines.push(`- Risk — field "risk": ${contract.risk}`);
    if (contract.change_type) lines.push(`- Change type — field "change_type": ${contract.change_type}`);
    if (contract.teach_back && contract.teach_back !== event.teach_back) {
      lines.push(`- Teach back — field "teach_back":\n  ${contract.teach_back}`);
    }

    if (contract.vocabulary && typeof contract.vocabulary === "object") {
      lines.push("");
      lines.push("### Shared Vocabulary — field \"vocabulary\"");
      for (const [term, def] of Object.entries(contract.vocabulary)) {
        lines.push(`- **${term}** — field "${term}": ${def}`);
      }
    }

    if (Array.isArray(contract.architecture) && contract.architecture.length) {
      lines.push("");
      lines.push("### Architecture Boundaries — field \"architecture\"");
      contract.architecture.forEach((rule: string, i: number) => {
        lines.push(`- [${i}] ${rule}`);
      });
    }

    if (Array.isArray(contract.requirements) && contract.requirements.length) {
      lines.push("");
      lines.push("### Requirements — field \"requirements\"");
      contract.requirements.forEach((req: any, i: number) => {
        lines.push(`- Requirement [${req.id ?? i}]: ${req.statement ?? "(no statement)"}`);
        if (req.source) lines.push(`  - Source — field "source": ${req.source}`);
        if (req.provenance && !req.source) lines.push(`  - Provenance — field "provenance": ${req.provenance}`);
        if (req.kind) lines.push(`  - Kind — field "kind": ${req.kind}`);
        if (req.in_scope !== undefined) lines.push(`  - In scope — field "in_scope": ${req.in_scope}`);
        if (req.bounds) lines.push(`  - Bounds — field "bounds": ${req.bounds}`);
      });
    }

    if (Array.isArray(contract.invariant_ids) && contract.invariant_ids.length) {
      lines.push("");
      lines.push(`### Invariant IDs — field "invariant_ids": ${contract.invariant_ids.join(", ")}`);
    }

    if (Array.isArray(contract.required_checks) && contract.required_checks.length) {
      lines.push("");
      lines.push(`### Required Checks — field "required_checks": ${contract.required_checks.join(", ")}`);
    }
  }

  // 3. Scope & Verification Checks
  const allChecks = scope.checks ?? payload.checks;
  if (scope.production?.length || scope.tests?.length || allChecks) {
    lines.push("");
    lines.push("## 3. Approved Scope — field \"scope\"");
    if (Array.isArray(scope.production) && scope.production.length) {
      lines.push(`### Production Paths (${scope.production.length} files) — field "production":`);
      scope.production.forEach((p: string) => lines.push(`- ${p}`));
    }
    if (Array.isArray(scope.tests) && scope.tests.length) {
      lines.push(`### Test Paths (${scope.tests.length} files) — field "tests":`);
      scope.tests.forEach((t: string) => lines.push(`- ${t}`));
    }
    if (allChecks && typeof allChecks === "object") {
      lines.push(`### Approved Checks — field "checks":`);
      for (const [id, argv] of Object.entries(allChecks)) {
        const cmdStr = Array.isArray(argv) ? argv.join(" ") : String(argv);
        lines.push(`- **${id}**: \`${cmdStr}\``);
        if (Array.isArray(argv)) {
          lines.push(`  argv: ${JSON.stringify(argv)}`);
        }
      }
    }
  }

  // 4. Extra / Unknown / Checkpoint Evidence
  const knownKeys = new Set(["event", "contract", "scope", "checks"]);
  const extraKeys = Object.keys(payload).filter((k) => !knownKeys.has(k));
  if (extraKeys.length) {
    lines.push("");
    lines.push("## 4. Checkpoint Evidence & Extra Payload Fields");
    for (const key of extraKeys) {
      lines.push(`### ${heading(key)} — field "${key}":`);
      lines.push(formatGenericValue(payload[key], 1));
    }
  }

  return lines.join("\n");
}

export function checkpointPresentation(payload: Json): CheckpointPresentation {
  const event = payload.event ?? {};
  const title = checkpointNames[event.type] ?? "Human checkpoint";
  return {
    title,
    summary: [
      ...checkpointSummary(payload),
      "Request changes or type an answer otherwise. Only explicit Approve submits this event.",
      "Review full details for all exact values, the complete contract, production/test scope, exact check argv and checkpoint evidence. Summary values may be shortened; viewing or editing details is not approval.",
    ].join("\n\n"),
    details: formatHumanReadableDetails(payload, title),
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
