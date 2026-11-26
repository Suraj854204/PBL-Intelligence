import { useState } from "react";
import { Copy, Download, Printer } from "lucide-react";
import type { Insight, Narrative, NarrativeMode, ReviewSummary } from "../../shared/types";
import { Skeleton, ErrorBox } from "../components/ui";
import { ModeToggle, NarrativeView } from "../components/Narrative";
import { download, qs, scopeName, slugName, useApi } from "../lib";
import { useApp } from "../state";

function Block({ title, items, facts, empty }: { title: string; items: Insight[]; facts: ReviewSummary["facts"]; empty: string }) {
  return (
    <section className="card">
      <div className="card-h"><h2>{title}</h2><small>{items.length}</small></div>
      {items.length === 0 ? <p className="muted">{empty}</p> : (
        <ul className="ins-list">{items.map((i) => (
          <li className="ins" key={i.id}><span className={`dot ${i.severity}`} aria-hidden /><span>{i.text}<span className="refs">{i.refs.map((r) => <sup key={r} title={`${r}: ${facts.find((f) => f.id === r)?.label} · ${facts.find((f) => f.id === r)?.source}`} className="ref">{r}</sup>)}</span></span></li>
        ))}</ul>
      )}
    </section>
  );
}

export default function ReviewPrep() {
  const { sel, toast } = useApp();
  const [tab, setTab] = useState<"summary" | "narrative">("summary");
  const [mode, setMode] = useState<NarrativeMode>("mock");
  const sum = useApi<ReviewSummary>(`/api/review-summary?${qs(sel)}`);
  const nar = useApi<Narrative>(tab === "narrative" ? `/api/narrative?${qs(sel, { mode })}` : null);
  const s = sum.data;
  const copy = async () => { if (!s) return; try { await navigator.clipboard.writeText(s.markdown); toast("Summary copied"); } catch { toast("Copy blocked. Use Download."); } };
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Review preparation</h1><p>Structured discussion points for {scopeName(sel)}, built from the deterministic engine. Change the month, district or block in the filter bar.</p></div>
      </div>
      <div className="tabs no-print" role="tablist">
        <button role="tab" aria-selected={tab === "summary"} onClick={() => setTab("summary")}>Monthly review summary</button>
        <button role="tab" aria-selected={tab === "narrative"} onClick={() => setTab("narrative")}>Reporting narrative</button>
      </div>
      {tab === "summary" && (
        sum.error ? <ErrorBox msg={sum.error} /> : !s ? <Skeleton h={400} /> : (
          <>
            <div className="actions-row no-print">
              <button className="btn" onClick={copy}><Copy size={14} />Copy as text</button>
              <button className="btn" onClick={() => download(`review-summary-${slugName(sel)}.md`, s.markdown)}><Download size={14} />Download .md</button>
              <button className="btn" onClick={() => window.print()}><Printer size={14} />Print / save PDF</button>
              <span className="muted" style={{ fontSize: 12 }}>Every line cites its computed facts (F-numbers). No AI is used on this tab.</span>
            </div>
            <h2 style={{ fontSize: 18 }}>{s.title}</h2>
            <div className="grid g2">
              <Block title="Achievements" items={s.achievements} facts={s.facts} empty="No indicator is On Track yet." />
              <Block title="Month-over-month movement" items={s.changes} facts={s.facts} empty="No prior month." />
              <Block title="Risks and gaps" items={s.risks} facts={s.facts} empty="No risks flagged." />
              <Block title="Priority districts and blocks" items={s.priorities} facts={s.facts} empty="Pick a wider scope to see priority geographies." />
            </div>
            <Block title="Discussion points for the meeting" items={s.discussion} facts={s.facts} empty="" />
          </>
        )
      )}
      {tab === "narrative" && (
        <>
          <div className="actions-row no-print"><span className="flabel">Generator</span><ModeToggle mode={mode} setMode={setMode} /><span className="muted" style={{ fontSize: 12 }}>Facts are always computed first; the generator only words them.</span></div>
          {nar.error ? <ErrorBox msg={nar.error} /> : !nar.data ? <Skeleton h={380} /> : <NarrativeView n={nar.data} filename={`program-narrative-${slugName(sel)}-${mode}`} />}
        </>
      )}
    </div>
  );
}
