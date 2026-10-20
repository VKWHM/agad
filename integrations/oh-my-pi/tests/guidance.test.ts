import { expect, test } from "bun:test";
import {
  bindEvent,
  explainRejection,
  extractJsonObject,
  normalizeReport,
} from "../src/guidance.ts";

test("bindEvent fills host-owned fields but never overrides or invents approval content", () => {
  const facts = { revision: 2, candidate: "sha256:a", findingCount: 0, verification: { delivery: "d", report: "r" } };
  expect(bindEvent({ type: "request_repair", reason: "x" }, facts)).toMatchObject({ revision: 2, candidate: "sha256:a" });
  expect(bindEvent({ type: "request_repair", revision: 1, candidate: "z" }, facts)).toMatchObject({ revision: 1, candidate: "z" });
  expect(bindEvent({ type: "provisionally_approve" }, facts)).toMatchObject({ presented_by: "architect", dispositions: {} });
  expect(bindEvent({ type: "provisionally_approve" }, { ...facts, findingCount: 2 }).dispositions).toBeUndefined();
  expect(bindEvent({ type: "accept" }, facts)).toMatchObject({ delivery: "d", report: "r" });
  expect(bindEvent({ type: "accept" }, facts).code_review).toBeUndefined();
});

test("extractJsonObject tolerates fences and prose, rejects non-objects", () => {
  expect(extractJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  expect(extractJsonObject('Here it is: {"a":{"b":2}} done')).toEqual({ a: { b: 2 } });
  expect(() => extractJsonObject("no json")).toThrow(/single JSON object/);
});

test("normalizeReport strips host-owned fields and stringifies evidence", () => {
  const out = normalizeReport({ actor: "x", revision: 9, candidate: "c", evidence: { files: ["a"] }, alignment: "aligned" });
  expect(out).toEqual({ evidence: '{"files":["a"]}', alignment: "aligned" });
});

test("explainRejection adds phase and a concrete fix", () => {
  const error = explainRejection(new Error("Core rejected record: Repair needs defect evidence linked to approved outcomes"), {
    phase: "test_authorized",
    type: "request_repair",
    outcomes: ["R1", "R2"],
  });
  expect(error.message).toContain("Current phase: test_authorized");
  expect(error.message).toContain('["R1","R2"]');
  expect(error.message).toContain("Do not resend the identical call");
});

import { buildEvent } from "../src/guidance.ts";
test("buildEvent enforces per-type required fields and drops irrelevant ones", () => {
  const allowed = ["request_repair", "revise", "accept"];
  expect(() => buildEvent({ type: "request_repair", reason: "r", changes_business_semantics: false }, allowed)).toThrow(/outcomes, evidence/);
  expect(() => buildEvent({ type: "cancel", reason: "r" }, allowed)).toThrow(/Unsupported/);
  expect(buildEvent({ type: "revise", reason: "r", actor: "developer", outcomes: ["R1"] }, allowed)).toEqual({ type: "revise", reason: "r" });
  expect(buildEvent({ type: "request_repair", reason: "r", changes_business_semantics: false, outcomes: ["R1"], evidence: "e" }, allowed)).toMatchObject({ outcomes: ["R1"] });
});
