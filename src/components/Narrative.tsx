import { useState } from "react";
import { Copy, Download, Printer, ShieldCheck, ShieldAlert } from "lucide-react";
import type { Narrative, NarrativeMode } from "../../shared/types";
import { download } from "../lib";
import { useApp } from "../state";

const MODES: { v: NarrativeMode; label: string; hint: string }[] = [
  { v: "off", label: "AI off", hint: "Deterministic fact summary" },
  { v: "mock", label: "Rule-based", hint: "Template narrative, no model" },
  { v: "llm", label: "LLM", hint: "Real model if a key is set; always grounded" },
];

export function ModeToggle({ mode, setMode }: { mode: NarrativeMode; setMode: (m: NarrativeMode) => void }) {
  const { meta } = useApp();
  return (
    <div className="seg" role="radiogroup" aria-label="Narrative generator">
      {MODES.map((m) => <button key={m.v} role="radio" aria-checked={mode === m.v} title={m.hint + (m.v === "llm" && !meta.ai.llmAvailable ? " (no API key set: falls back to rule-based)" : "")} onClick={() => setMode(m.v)}>{m.label}</button>)}
    </div>
  );
}

export function NarrativeView({ n, filename, showSources: initial = false }: { n: Narrative; filename: string; showSources?: boolean }) {
  const { toast } = useApp();
  const [src, setSrc] = useState(initial);
  const used = new Set(n.sections.flatMap((s) => s.segments.flatMap((g) => g.refs)));
  const facts = n.facts.filter((f) => used.has(f.id));
  const byId = Object.fromEntries(n.facts.map((f) => [f.id, f]));
  const copy = async () => { try { await navigator.clipboard.writeText(n.markdown); toast("Report copied"); } catch { toast("Copy blocked by the browser. Use Download instead."); } };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="actions-row no-print">
        <button className="btn" onClick={copy}><Copy size={14} />Copy text</button>
        <button className="btn" onClick={() => download(`${filename}.md`, n.markdown)}><Download size={14} />Download .md</button>
        <button className="btn" onClick={() => window.print()}><Printer size={14} />Print / save PDF</button>
        <label className="btn ghost" style={{ cursor: "pointer" }}><input type="checkbox" checked={src} onChange={(e) => setSrc(e.target.checked)} /> Show source facts</label>
        <span className={`badge ${n.validation.ok ? "st-on-track" : "st-critical"}`} title="Every number in the text is checked against the computed fact list">{n.validation.ok ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}{n.validation.ok ? `Grounded: ${n.validation.checkedNumbers} numbers checked` : "Grounding failed"}</span>
      </div>
      {n.fallbackReason && <div className="notice info" role="status">{n.fallbackReason}</div>}
      <div className="legend-line no-print"><span><span className="seg-fact">Computed fact</span> from data (hover for source)</span><span><span className="seg-expl">Generated explanation</span> interpretation only, no new numbers</span><span>Generator: <b>{n.modeUsed === "deterministic" ? "deterministic" : n.modeUsed === "mock" ? "rule-based" : "LLM"}</b></span></div>
      <article className="doc">
        <h1>{n.markdown.split("\n")[0].replace(/^# /, "")}</h1>
        {n.sections.map((s) => {
          const list = s.segments.length > 1 && s.segments.every((g) => g.text.startsWith("• "));
          const seg = (g: (typeof s.segments)[number], i: number) => (
            <span key={i}>
              <span className={g.kind === "explanation" ? "seg-expl" : "seg-fact"} title={g.kind === "fact" ? g.refs.map((r) => `${r}: ${byId[r]?.label} = ${byId[r]?.display} (${byId[r]?.source})`).join("\n") : "Generated interpretation"}>{g.text.replace(/^• /, "")}</span>
              {g.refs.map((r) => <sup key={r}><a className="ref" href={`#fact-${r}`} onClick={() => setSrc(true)}>{r}</a></sup>)}{" "}
            </span>
          );
          return <section key={s.heading}><h2>{s.heading}</h2>{list ? <ul>{s.segments.map((g, i) => <li key={i}>{seg(g, i)}</li>)}</ul> : <p>{s.segments.map(seg)}</p>}</section>;
        })}
      </article>
      {src && (
        <div className="card" id="sources"><div className="card-h"><h3>Source facts used</h3><small>{facts.length} facts</small></div>
          <div className="tbl-wrap"><table><thead><tr><th>Ref</th><th>Fact</th><th className="r">Value</th><th>Calculation / source</th></tr></thead>
            <tbody>{facts.map((f) => <tr key={f.id} id={`fact-${f.id}`}><td><b>{f.id}</b></td><td>{f.label}</td><td className="r num"><b>{f.display}</b></td><td className="muted">{f.source}</td></tr>)}</tbody></table></div>
        </div>
      )}
    </div>
  );
}
