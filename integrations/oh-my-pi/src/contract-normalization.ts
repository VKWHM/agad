import type { Json, Scope } from "./types.ts";

export function parseJsonArg(val: unknown, paramName: string): any {
  if (val && typeof val === "object") return val;
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) {
      throw new Error(`Parameter '${paramName}' cannot be empty`);
    }
    try {
      return JSON.parse(trimmed);
    } catch (e) {
      throw new Error(
        `Invalid JSON in '${paramName}': ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  throw new Error(
    `Missing required parameter '${paramName}' (expected a JSON string or object)`,
  );
}

export function normalizeScope(raw: unknown): Scope {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(
      "Scope must be an object with { production: string[], tests: string[], checks: Record<string, string[]> }",
    );
  }
  const obj = raw as Record<string, any>;

  // 1. Normalize production array (accepting production, production_paths, or implementer role write_paths)
  const rawProduction =
    obj.production ?? obj.production_paths ?? obj.roles?.implementer?.write_paths;
  const production = Array.isArray(rawProduction)
    ? rawProduction.filter((p): p is string => typeof p === "string" && Boolean(p.trim()))
    : [];

  // 2. Normalize tests array (accepting tests, test_paths, or test_engineer role write_paths)
  const rawTests =
    obj.tests ?? obj.test_paths ?? obj.roles?.test_engineer?.write_paths;
  const tests = Array.isArray(rawTests)
    ? rawTests.filter((p): p is string => typeof p === "string" && Boolean(p.trim()))
    : [];

  // 3. Normalize checks (accepting checks object or required_checks list of { id, argv })
  const checks: Record<string, string[]> = {};
  if (obj.checks && typeof obj.checks === "object" && !Array.isArray(obj.checks)) {
    for (const [key, val] of Object.entries(obj.checks)) {
      if (Array.isArray(val)) {
        checks[key] = val.filter((s): s is string => typeof s === "string" && Boolean(s.trim()));
      } else if (typeof val === "string" && val.trim()) {
        checks[key] = val.trim().split(/\s+/).filter(Boolean);
      }
    }
  } else if (Array.isArray(obj.required_checks) || Array.isArray(obj.checks)) {
    const list = Array.isArray(obj.required_checks) ? obj.required_checks : obj.checks;
    for (const item of list) {
      if (item && typeof item === "object") {
        const id = item.id ?? item.name;
        const argv = item.argv ?? item.command;
        if (typeof id === "string" && Array.isArray(argv)) {
          checks[id] = argv.filter((s): s is string => typeof s === "string" && Boolean(s.trim()));
        } else if (typeof id === "string" && typeof argv === "string" && argv.trim()) {
          checks[id] = argv.trim().split(/\s+/).filter(Boolean);
        }
      }
    }
  }

  return { production, tests, checks };
}

export function normalizeContract(
  raw: unknown,
  scopeChecks?: Record<string, string[]>,
): Json {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Contract must be a JSON object");
  }
  const contract = structuredClone(raw) as Record<string, any>;

  // Revision
  if (contract.revision === undefined && typeof contract.version === "number") {
    contract.revision = contract.version;
  }
  if (
    typeof contract.revision !== "number" ||
    contract.revision <= 0 ||
    !Number.isInteger(contract.revision)
  ) {
    throw new Error(
      `Contract needs a positive integer 'revision' (e.g. revision: 1). Found: ${JSON.stringify(contract.revision ?? contract.version)}`,
    );
  }

  // Intent and rationale
  if (!contract.intent || typeof contract.intent !== "string") {
    throw new Error("Contract needs an 'intent' string describing the goal.");
  }
  if (!contract.rationale || typeof contract.rationale !== "string") {
    contract.rationale = contract.intent;
  }

  // Change type
  if (contract.change_type === "feature") contract.change_type = "business";
  if (contract.change_type === "fix" || contract.change_type === "refactor") {
    contract.change_type = "technical";
  }
  if (!["business", "technical"].includes(contract.change_type)) {
    throw new Error(
      `Contract 'change_type' must be 'business' or 'technical' (found: ${JSON.stringify(contract.change_type)}).`,
    );
  }

  // Risk
  if (Array.isArray(contract.risk)) {
    contract.risk = "standard";
  } else if (!["trivial", "routine", "standard", "critical"].includes(contract.risk)) {
    contract.risk = "standard";
  }

  // Architecture: string[]
  if (
    contract.architecture &&
    !Array.isArray(contract.architecture) &&
    typeof contract.architecture === "object"
  ) {
    const flat: string[] = [];
    for (const [key, val] of Object.entries(contract.architecture)) {
      if (Array.isArray(val)) {
        for (const item of val) {
          if (typeof item === "string" && item.trim()) {
            flat.push(`${key}: ${item.trim()}`);
          }
        }
      } else if (typeof val === "string" && val.trim()) {
        flat.push(`${key}: ${val.trim()}`);
      }
    }
    contract.architecture = flat;
  }
  if (!Array.isArray(contract.architecture) || !contract.architecture.length) {
    throw new Error("Contract needs an 'architecture' array of boundary strings.");
  }

  // Required checks: string[]
  if (!Array.isArray(contract.required_checks) || !contract.required_checks.length) {
    if (scopeChecks && Object.keys(scopeChecks).length) {
      contract.required_checks = Object.keys(scopeChecks);
    } else {
      throw new Error(
        "Contract needs 'required_checks' array of check IDs matching scope.checks.",
      );
    }
  }

  // Vocabulary
  if (
    !contract.vocabulary ||
    typeof contract.vocabulary !== "object" ||
    Array.isArray(contract.vocabulary)
  ) {
    contract.vocabulary = { [contract.intent.slice(0, 20)]: contract.intent };
  }

  // Requirements
  if (!Array.isArray(contract.requirements) || !contract.requirements.length) {
    // If missing, synthesize a base requirement from intent so the contract can be approved
    contract.requirements = [
      {
        id: "R1",
        statement: contract.intent,
        source: "developer-dialogue",
        in_scope: true,
        kind: "confirmed",
      },
    ];
  }
  for (const [i, req] of contract.requirements.entries()) {
    if (!req || typeof req !== "object") {
      throw new Error(`Requirement at index ${i} must be an object`);
    }
    if (!req.id || typeof req.id !== "string") {
      req.id = `R${i + 1}`;
    }
    if (!req.statement || typeof req.statement !== "string") {
      throw new Error(`Requirement '${req.id}' is missing a string 'statement'`);
    }
    if (!req.source && req.provenance) req.source = req.provenance;
    if (!req.source || typeof req.source !== "string") {
      req.source = "developer-dialogue";
    }
    if (typeof req.in_scope !== "boolean") {
      req.in_scope = true;
    }
    if (!req.kind) {
      req.kind = req.knowledge_state ?? "confirmed";
    }
    if (!["confirmed", "existing", "delegated", "unknown"].includes(req.kind)) {
      req.kind = "confirmed";
    }
  }

  // Invariant IDs
  if (!Array.isArray(contract.invariant_ids)) {
    contract.invariant_ids = contract.requirements
      .filter((r: any) => r.in_scope && r.kind === "confirmed")
      .map((r: any) => r.id);
  }

  // Teach back
  if (!contract.teach_back || typeof contract.teach_back !== "string") {
    contract.teach_back =
      contract.intent || contract.rationale || "Living domain contract proposal";
  }

  return contract;
}
