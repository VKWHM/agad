import { describe, expect, test } from "bun:test";
import {
  normalizeContract,
  normalizeScope,
  parseJsonArg,
} from "../src/contract-normalization.ts";

describe("parseJsonArg", () => {
  test("parses valid JSON string", () => {
    expect(parseJsonArg('{"a":1}', "test_arg")).toEqual({ a: 1 });
  });

  test("returns object directly if already parsed", () => {
    expect(parseJsonArg({ a: 1 }, "test_arg")).toEqual({ a: 1 });
  });

  test("throws readable error on invalid JSON", () => {
    expect(() => parseJsonArg("not-json", "test_arg")).toThrow(
      "Invalid JSON in 'test_arg'",
    );
  });

  test("throws readable error on missing or empty input", () => {
    expect(() => parseJsonArg("", "test_arg")).toThrow("cannot be empty");
    expect(() => parseJsonArg(null, "test_arg")).toThrow("Missing required parameter");
  });
});

describe("normalizeScope", () => {
  test("accepts standard Scope format", () => {
    const raw = {
      production: ["src/a.ts"],
      tests: ["tests/a.ts"],
      checks: { test: ["bun", "test"] },
    };
    expect(normalizeScope(raw)).toEqual(raw);
  });

  test("normalizes production_paths and test_paths (from user failure screenshot)", () => {
    const raw = {
      production_paths: ["crates/checkout/src/lib.rs"],
      test_paths: ["crates/checkout/tests/test.rs"],
      required_checks: [
        { id: "format", argv: ["cargo", "fmt"] },
        { id: "test", argv: ["cargo", "test"] },
      ],
    };
    const normalized = normalizeScope(raw);
    expect(normalized.production).toEqual(["crates/checkout/src/lib.rs"]);
    expect(normalized.tests).toEqual(["crates/checkout/tests/test.rs"]);
    expect(normalized.checks).toEqual({
      format: ["cargo", "fmt"],
      test: ["cargo", "test"],
    });
  });

  test("normalizes role write_paths if present", () => {
    const raw = {
      roles: {
        implementer: { write_paths: ["src/impl.ts"] },
        test_engineer: { write_paths: ["tests/test.ts"] },
      },
      checks: { lint: ["bun", "lint"] },
    };
    const normalized = normalizeScope(raw);
    expect(normalized.production).toEqual(["src/impl.ts"]);
    expect(normalized.tests).toEqual(["tests/test.ts"]);
    expect(normalized.checks).toEqual({ lint: ["bun", "lint"] });
  });

  test("handles required_checks with command string", () => {
    const raw = {
      production: ["src/lib.rs"],
      tests: ["tests/smoke.rs"],
      required_checks: [
        { id: "smoke", command: "bunx nx run smoke" },
      ],
    };
    const normalized = normalizeScope(raw);
    expect(normalized.checks).toEqual({
      smoke: ["bunx", "nx", "run", "smoke"],
    });
  });

  test("throws readable error on invalid scope type", () => {
    expect(() => normalizeScope(null)).toThrow("Scope must be an object");
    expect(() => normalizeScope("not an object")).toThrow("Scope must be an object");
  });
});

describe("normalizeContract", () => {
  test("normalizes version to revision, feature to business, risk array to standard", () => {
    const raw = {
      version: 2,
      intent: "Implement Rust RedeemHandoff",
      rationale: "Complete application use case",
      vocabulary: { handoff: "Secret token" },
      architecture: {
        preserve: ["CheckoutSession", "Domain decisions"],
        mechanism: ["RedeemHandoff public token"],
      },
      risk: ["Concurrency risk", "Commit expiry"],
      change_type: "feature",
      requirements: [
        {
          id: "R1",
          statement: "Valid handoff returns credential",
          provenance: "smoke fixture",
          in_scope: true,
          knowledge_state: "confirmed",
        },
      ],
      invariant_ids: ["R1"],
    };

    const scopeChecks = {
      format: ["cargo", "fmt"],
      test: ["cargo", "test"],
    };

    const normalized = normalizeContract(raw, scopeChecks);
    expect(normalized.revision).toBe(2);
    expect(normalized.change_type).toBe("business");
    expect(normalized.risk).toBe("standard");
    expect(Array.isArray(normalized.architecture)).toBe(true);
    expect(normalized.architecture).toEqual([
      "preserve: CheckoutSession",
      "preserve: Domain decisions",
      "mechanism: RedeemHandoff public token",
    ]);
    expect(normalized.required_checks).toEqual(["format", "test"]);
    expect(normalized.requirements[0].source).toBe("smoke fixture");
    expect(normalized.requirements[0].kind).toBe("confirmed");
    expect(normalized.teach_back).toBe("Implement Rust RedeemHandoff");
  });

  test("throws readable errors when intent or revision is missing", () => {
    expect(() => normalizeContract({ intent: "no revision" })).toThrow(
      "Contract needs a positive integer 'revision'",
    );
    expect(() => normalizeContract({ revision: 1 })).toThrow(
      "Contract needs an 'intent' string",
    );
  });
});
