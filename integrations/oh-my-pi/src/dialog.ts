import type { ExtensionUIContext } from "@oh-my-pi/pi-coding-agent";
import type { HumanAnswer, PendingQuestion } from "./types.ts";
import { pendingPresentation } from "./presentation.ts";
import { runTmuxConsultation } from "./consultation-pane.ts";
export interface DialogPort {
  ui: ExtensionUIContext;
  save(): void;
  current?(): void;
  tmuxConsultation?: boolean;
  partner(prompt: string, signal?: AbortSignal): Promise<string>;
}
// The host returns labels, not option IDs. Reserve distinct presentation-only
// action labels without changing any original pending option.
function actionLabel(base: string, used: Set<string>) {
  let label = base;
  for (let suffix = 2; used.has(label); suffix++)
    label = `${base} (${suffix})`;
  used.add(label);
  return label;
}
// The native dialog owns the original question. A consultation never resolves it.
export async function askPending(
  pending: PendingQuestion,
  port: DialogPort,
  signal?: AbortSignal,
): Promise<HumanAnswer | undefined> {
  const labels = new Set(pending.options.map((option) => option.label));
  const chat = actionLabel("Chat about this — Decision Partner", labels);
  const presentation = pendingPresentation(pending);
  const review = presentation ? actionLabel("Review full details", labels) : undefined;
  const question = presentation
    ? `${presentation.title}\n\n${presentation.summary}`
    : `${pending.question}\n\n${pending.context}`;
  const other = actionLabel("Type another answer", labels);
  while (!signal?.aborted) {
    port.current?.();
    let answer: HumanAnswer | undefined,
      discuss = false,
      showDetails = false;
    if (port.ui.askDialog) {
      const result = await port.ui.askDialog(
        [
          {
            id: pending.id,
            question,
            options: [
              ...pending.options,
              ...(review ? [{ label: review, description: "Complete original payload; viewing is not approval" }] : []),
              { label: chat, description: "Private consultation; not an answer or approval" },
            ],
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
        // A mixed result is not an explicit human choice, even if the text is
        // blank. Leave the question pending rather than interpreting approval.
        if (
          item.selectedOptions.length &&
          (item.customInput !== undefined || item.customInputImages?.length)
        )
          return;
        if (
          item.selectedOptions.length > 1 ||
          item.selectedOptions.some(
            (s) => s !== chat && s !== review && !pending.options.some((o) => o.label === s),
          )
        )
          throw new Error("Invalid native answer");
        if (item.selectedOptions[0] === chat) discuss = true;
        else if (review && item.selectedOptions[0] === review) showDetails = true;
        else
          answer = {
            selected: item.selectedOptions[0],
            custom: item.customInput,
            note: item.note,
          };
      }
    } else {
      const options = pending.options.map((o) => o.label);
      const selected = await port.ui.select(
        question,
        [...options, ...(review ? [review] : []), chat, other],
        { signal },
      );
      if (selected === undefined) return;
      discuss = selected === chat;
      showDetails = !!review && selected === review;
      if (selected === other)
        answer = {
          custom: await port.ui.input("Your answer", undefined, { signal }),
        };
      else if (!discuss && !showDetails) {
        if (!options.includes(selected)) throw new Error("Invalid native answer");
        answer = { selected };
      }
    }
    port.current?.();
    if (showDetails && presentation) {
      // Native scrollable editor is only a display. Its returned text has no authority.
      await port.ui.editor("Review full details — close to return; not approval", presentation.details, { signal });
      port.current?.();
      continue;
    }
    if (!discuss) {
      if (answer?.custom?.trim() || answer?.selected) return answer;
      continue;
    }
    // In tmux, keep the OMP view on the left and run the private conversation
    // in a smaller right pane. Failed/unavailable tmux uses the explicit native fallback.
    const pane = await runTmuxConsultation(pending, port, signal, port.tmuxConsultation !== false);
    if (signal?.aborted) return;
    if (pane.opened) {
      if (pane.reason) port.ui.notify(`Consultation pane stopped: ${pane.reason}`, "error");
      port.current?.();
      continue;
    }
    if (pane.reason) port.ui.notify(pane.reason, "info");
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
