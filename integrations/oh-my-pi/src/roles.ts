import { Effort, type Model } from "@oh-my-pi/pi-ai";
import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
export type Role =
  | "architect"
  | "scout"
  | "implementer"
  | "business_reviewer"
  | "test_engineer"
  | "decision_partner";
export const profiles = {
  architect: { id: "gpt-6.1-sol", effort: Effort.High },
  scout: { id: "gpt-6-luna", effort: Effort.Low },
  implementer: { id: "gpt-6.1-sol", effort: Effort.Medium },
  business_reviewer: { id: "gpt-6.1-sol", effort: Effort.Medium },
  test_engineer: { id: "gpt-6-luna", effort: Effort.High },
  decision_partner: { id: "gpt-6.1-sol", effort: Effort.Medium },
} as const;
export const readTools = ["read", "grep", "glob", "find", "web_search"];
export function profile(role: Role, critical = false) {
  return {
    ...profiles[role],
    effort:
      role === "business_reviewer" && critical
        ? Effort.High
        : profiles[role].effort,
  };
}
export function assertIdentity(
  model: Pick<Model, "provider" | "id"> | undefined,
  effort: string | undefined,
  provider: string,
  role: Role,
  critical = false,
) {
  const expected = profile(role, critical);
  if (
    model?.provider !== provider ||
    model.id !== expected.id ||
    effort !== expected.effort
  )
    throw new Error(
      `AGAD ${role} requires exactly ${provider}/${expected.id}:${expected.effort}; no fallback is allowed.`,
    );
}
export async function resolveModel(
  ctx: Pick<ExtensionContext, "modelRegistry">,
  provider: string,
  role: Role,
  critical = false,
) {
  const p = profile(role, critical);
  const model = ctx.modelRegistry.find(provider, p.id);
  if (!model || !model.thinking?.efforts.includes(p.effort))
    throw new Error(
      `Unavailable exact model/effort: ${provider}/${p.id}:${p.effort}`,
    );
  if (!(await ctx.modelRegistry.getApiKey(model)))
    throw new Error(`No authenticated access for ${provider}/${p.id}`);
  return model;
}

// OMP isolates hook exceptions. Abort explicitly before throwing so an error
// cannot be logged and then ignored while the wrong model reaches transport.
export function guardIdentity(
  ctx: Pick<ExtensionContext, "model" | "abort">,
  effort: string | undefined,
  provider: string,
  role: Role,
  critical = false,
) {
  try {
    assertIdentity(ctx.model, effort, provider, role, critical);
  } catch (error) {
    ctx.abort();
    throw error;
  }
}
