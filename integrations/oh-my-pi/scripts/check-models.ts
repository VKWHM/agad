import { discoverAuthStorage, ModelRegistry } from "@oh-my-pi/pi-coding-agent";
import { profiles, resolveModel } from "../src/roles.ts";
const auth = await discoverAuthStorage();
const modelRegistry = new ModelRegistry(auth);
await modelRegistry.refresh();
const provider = process.env.AGAD_OMP_PROVIDER ?? "openai-codex";
let failed = false;
for (const role of Object.keys(profiles) as (keyof typeof profiles)[]) {
  try {
    const model = await resolveModel({ modelRegistry }, provider, role);
    console.log(
      `${role}: ${model.provider}/${model.id}:${profiles[role].effort} available`,
    );
  } catch (e) {
    failed = true;
    console.error(`${role}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
try {
  await resolveModel({ modelRegistry }, provider, "business_reviewer", true);
  console.log("business_reviewer critical: high available");
} catch (e) {
  failed = true;
  console.error(String(e));
}
process.exit(failed ? 1 : 0);
