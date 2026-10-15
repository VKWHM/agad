import type { ExtensionUIContext } from "@oh-my-pi/pi-coding-agent";
import type { HumanAnswer, PendingQuestion } from "./types.ts";
export interface DialogPort {
  ui: ExtensionUIContext;
  save(): void;
  partner(prompt: string, signal?: AbortSignal): Promise<string>;
}
// The native dialog owns the original question. A consultation never resolves it.
export async function askPending(
  pending: PendingQuestion,
  port: DialogPort,
  signal?: AbortSignal,
): Promise<HumanAnswer | undefined> {
  while (!signal?.aborted) {
    let answer: HumanAnswer | undefined,
      discuss = false;
    if (port.ui.askDialog) {
      const result = await port.ui.askDialog(
        [
          {
            id: pending.id,
            question: `${pending.question}\n\n${pending.context}`,
            options: pending.options,
          },
        ],
        { signal },
      );
      if (!result) return;
      if (result.kind === "chat") discuss = true;
      else {
        const item = result.results[0];
        if (
          result.results.length !== 1 ||
          item?.id !== pending.id ||
          item.timedOut
        )
          return;
        if (
          item.selectedOptions.length > 1 ||
          item.selectedOptions.some(
            (s) => !pending.options.some((o) => o.label === s),
          )
        )
          throw new Error("Invalid native answer");
        answer = {
          selected: item.selectedOptions[0],
          custom: item.customInput,
          note: item.note,
        };
      }
    } else {
      const options = pending.options.map((o) => o.label);
      const selected = await port.ui.select(
        `${pending.question}\n\n${pending.context}`,
        [...options, "Discuss with Decision Partner", "Type another answer"],
        { signal },
      );
      if (selected === undefined) return;
      discuss = selected === "Discuss with Decision Partner";
      if (selected === "Type another answer")
        answer = {
          custom: await port.ui.input("Your answer", undefined, { signal }),
        };
      else if (!discuss) answer = { selected };
    }
    if (!discuss) {
      if (answer?.custom?.trim() || answer?.selected) return answer;
      continue;
    }
    // No parent message is sent, no new Architect turn starts, no approval is recorded.
    while (!signal?.aborted) {
      const prompt = await port.ui.input(
        "Decision Partner — critique, compare options, or ask for Scout research. Cancel to return.",
        undefined,
        { signal },
      );
      if (!prompt?.trim()) break;
      pending.consultation.push({ speaker: "developer", text: prompt });
      port.save();
      let response: string;
      try {
        response = await port.partner(prompt, signal);
      } catch (e) {
        port.ui.notify(
          `Consultation stopped: ${e instanceof Error ? e.message : String(e)}`,
          "error",
        );
        break;
      }
      pending.consultation.push({ speaker: "partner", text: response });
      port.save();
      // Native editor is a scrollable transcript; edits here are private consultation notes.
      await port.ui.editor(
        "Decision Partner (advisory; not an answer or approval)",
        response,
        { signal },
      );
      const next = await port.ui.select(
        "Continue consulting or return to the unchanged Architect question?",
        ["Ask a follow-up", "Return to Architect question"],
        { signal },
      );
      if (next !== "Ask a follow-up") break;
    }
  }
}
export function isExplicitApproval(answer: HumanAnswer | undefined) {
  return answer?.selected === "Approve" && !answer.custom?.trim();
}
