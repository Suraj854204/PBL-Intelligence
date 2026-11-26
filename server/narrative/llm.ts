import type { FactRef, NarrativeSection } from "../../shared/types.js";
import { validate } from "./facts.js";

export type LlmClient = (system: string, user: string) => Promise<string>;

/** Real LLM call via the Anthropic Messages API. Only used when ANTHROPIC_API_KEY is set; never on the deterministic path. */
export const anthropicClient: LlmClient | null = process.env.ANTHROPIC_API_KEY
  ? async (system, user) => {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5", max_tokens: 1800, system, messages: [{ role: "user", content: user }] }),
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
      const j: any = await res.json();
      return (j.content ?? []).map((c: any) => c.text ?? "").join("");
    }
  : null;

const SYSTEM = `You write short, report-ready sections for an education program review.
Rules: use ONLY the numbers in the supplied FACTS. Never invent achievements, places, causes, people or evidence.
Mark sentences that restate computed values as kind "fact" with refs to fact ids; mark interpretation as kind "explanation" (no new numbers).
Return ONLY JSON: {"sections":[{"heading":string,"segments":[{"kind":"fact"|"explanation","text":string,"refs":["F1"]}]}]}`;

export async function llmNarrative(client: LlmClient, facts: FactRef[], outline: NarrativeSection[], extraAllowed: string[]): Promise<{ sections?: NarrativeSection[]; error?: string }> {
  try {
    const user = `FACTS:\n${JSON.stringify(facts.map((f) => ({ id: f.id, label: f.label, value: f.display })))}\n\nOUTLINE (keep these headings, same order):\n${JSON.stringify(outline.map((s) => s.heading))}`;
    const raw = await client(SYSTEM, user);
    const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    const parsed = JSON.parse(json);
    const sections: NarrativeSection[] = (parsed.sections ?? []).map((s: any) => ({
      heading: String(s.heading),
      segments: (s.segments ?? []).map((g: any) => ({ kind: g.kind === "fact" ? "fact" : "explanation", text: String(g.text), refs: Array.isArray(g.refs) ? g.refs.map(String) : [] })),
    }));
    if (!sections.length) return { error: "LLM returned no sections" };
    const v = validate(sections, facts, extraAllowed);
    if (!v.ok) return { error: `LLM output failed grounding check (${v.unsupported.slice(0, 4).join(", ")})` };
    return { sections };
  } catch (e) {
    return { error: `LLM unavailable: ${(e as Error).message}` };
  }
}
