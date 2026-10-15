// The reference core owns this JSON shape and validates it across the bridge.
export type Json = Record<string, any>;
export interface Scope {
  production: string[];
  tests: string[];
  checks: Record<string, string[]>;
}
export interface PendingQuestion {
  id: string;
  question: string;
  options: { label: string; description?: string }[];
  context: string;
  revision?: number;
  candidate?: string;
  event?: Json;
  scope?: Scope;
  consultation: { speaker: "developer" | "partner"; text: string }[];
}
export interface AdapterState {
  record?: Json;
  scope?: Scope;
  phase: string;
  pending?: PendingQuestion;
  verification?: { tests: string; delivery: string; report: string };
}
export interface HumanAnswer {
  selected?: string;
  custom?: string;
  note?: string;
}
export const STATE_ENTRY = "agad.omp.state.v1";
