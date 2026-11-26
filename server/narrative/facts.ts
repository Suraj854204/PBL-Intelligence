import type { FactRef, Narrative, NarrativeMode, NarrativeSection } from "../../shared/types.js";

/** Registry of computed facts. Every number that may appear in generated text must be registered here first. */
export class FactBook {
  private list: FactRef[] = [];
  private byKey = new Map<string, FactRef>();
  add(key: string, label: string, raw: number | string, display: string, source: string): FactRef {
    const hit = this.byKey.get(key);
    if (hit) return hit;
    const f: FactRef = { id: `F${this.list.length + 1}`, label, display, raw, source };
    this.list.push(f);
    this.byKey.set(key, f);
    return f;
  }
  get all() { return this.list; }
  idOf(key: string) { return this.byKey.get(key)?.id ?? ""; }
  byKeyGet(key: string) { return this.byKey.get(key); }
  get(id: string) { return this.list.find((f) => f.id === id); }
}

const NUM = /\d[\d,]*(?:\.\d+)?/g;
const norm = (t: string) => t.replace(/,/g, "").replace(/^0+(?=\d)/, "");

/** Static numbers that are part of the rules, not data: thresholds, grades, year. */
const ALWAYS = ["35", "60", "75", "100", "6", "7", "8", "2025", "0", "1", "2", "3", "5"];

export function allowedNumbers(facts: FactRef[], extraText: string[] = []): Set<string> {
  const s = new Set(ALWAYS);
  for (const f of facts) for (const t of `${f.display} ${f.label} ${f.raw}`.match(NUM) ?? []) s.add(norm(t));
  for (const t of extraText) for (const m of t.match(NUM) ?? []) s.add(norm(m));
  return s;
}

/** Grounding check: every number in generated prose must exist in the fact registry; fact ids must be real. */
export function validate(sections: NarrativeSection[], facts: FactRef[], extraAllowed: string[] = []): Narrative["validation"] {
  const ok = allowedNumbers(facts, extraAllowed);
  const ids = new Set(facts.map((f) => f.id));
  const bad: string[] = [];
  let checked = 0;
  for (const sec of sections) for (const seg of sec.segments) {
    for (const r of seg.refs) if (!ids.has(r)) bad.push(`unknown fact ref ${r}`);
    const text = seg.text.replace(/\[F\d+\]/g, "");
    for (const t of text.match(NUM) ?? []) {
      checked++;
      if (!ok.has(norm(t)) && !ok.has(norm(t).replace(/\.0+$/, ""))) bad.push(t);
    }
  }
  return { ok: bad.length === 0, checkedNumbers: checked, unsupported: [...new Set(bad)] };
}

export function toMarkdown(title: string, sections: NarrativeSection[], facts: FactRef[], footer: string[] = []): string {
  const used = new Set(sections.flatMap((s) => s.segments.flatMap((g) => g.refs)));
  const lines = [`# ${title}`, ""];
  for (const s of sections) {
    lines.push(`## ${s.heading}`, "");
    const isList = s.segments.length > 1 && s.segments.every((g) => g.kind === "fact" && g.text.startsWith("• "));
    if (isList) for (const g of s.segments) lines.push(`- ${g.text.slice(2)} ${g.refs.map((r) => `[${r}]`).join("")}`);
    else lines.push(s.segments.map((g) => `${g.text}${g.refs.length ? " " + g.refs.map((r) => `[${r}]`).join("") : ""}`).join(" "));
    lines.push("");
  }
  lines.push("## Source facts", "", "| Ref | Fact | Value | Source |", "|---|---|---|---|");
  for (const f of facts.filter((x) => used.has(x.id))) lines.push(`| ${f.id} | ${f.label} | ${f.display} | ${f.source} |`);
  if (footer.length) lines.push("", ...footer.map((f) => `_${f}_`));
  return lines.join("\n");
}

export const MODE_LABEL: Record<NarrativeMode | "deterministic", string> = {
  off: "Deterministic fact summary", mock: "Rule-based narrative", llm: "LLM narrative", deterministic: "Deterministic fact summary",
};
