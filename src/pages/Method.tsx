import { RiskRuler } from "../components/ui";
import { useApp } from "../state";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import { num } from "../lib";

export default function Method() {
  const { meta } = useApp();
  return (
    <div className="page">
      <div className="page-head"><div><h1>Data and method</h1><p>How every number is calculated, how risk is decided, and what the data can and cannot support.</p></div></div>
      <div className="grid g2">
        <section className="card"><div className="card-h"><h2>Risk bands</h2><small>applied in code, never by AI</small></div>
          <RiskRuler value={0.62} ticks label="Risk bands: Critical under 35, At Risk 35 to 60, Behind 60 to 75, On Track 75 and above" />
          <div className="kv" style={{ marginTop: 14 }}><span>On Track</span><span>75% or above</span><span>Behind</span><span>60% to under 75%</span><span>At Risk</span><span>35% to under 60%</span><span>Critical</span><span>under 35%</span></div>
          <p className="ink2" style={{ marginTop: 12 }}>Each indicator is banded separately. A district, block or grant takes the <b>status of its weakest indicator</b>, so one strong number cannot hide a weak one. Schools are banded on their own attendance rate, which reproduces the file’s “Derived: Risk status” on all {num(meta.totals.rows)} rows.</p>
        </section>
        <section className="card"><div className="card-h"><h2>Metric definitions</h2></div>
          <dl style={{ margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {[["PBL participation", "Schools that ran a PBL project ÷ all schools in scope. With a class or subject filter, a school counts only if it recorded attendance in that class and subject."], ["Evidence submission", "Schools that submitted evidence ÷ all schools in scope (same denominator as the grant file, so the two reconcile)."], ["Attendance", "Attendance summed over Science and Math sessions ÷ (enrollment × 2 sessions). This is the definition behind the file’s own attendance rate. Schools that did not run PBL count as zero."], ["Composite score", "Mean of the three rates. Used only to rank geographies."], ["Students in the gap", "Enrollment × how far the composite sits below 75%. Used to order follow-up so field time reaches the most learners."], ["Month-over-month", "Percentage-point change against the previous reporting month under the same filters. July has no prior month."]].map(([t, d]) => <div key={t}><dt style={{ fontWeight: 750 }}>{t}</dt><dd style={{ margin: 0, color: "var(--ink-2)" }}>{d}</dd></div>)}
          </dl></section>
      </div>
      <section className="card"><div className="card-h"><h2>Data checks</h2><small>run on load across {num(meta.totals.rows)} school-month rows</small></div>
        <ul className="ins-list">{meta.quality.map((q) => <li className="ins" key={q.id}>{q.severity === "warning" ? <TriangleAlert size={16} color="var(--behind)" style={{ flex: "none", marginTop: 3 }} /> : <CheckCircle2 size={16} color="var(--ok)" style={{ flex: "none", marginTop: 3 }} />}<span><b>{q.title}</b>{q.count ? ` · ${num(q.count)} ${q.id === "rawgt" ? "rows" : "cases"}` : ""}<br /><span className="ink2">{q.detail}</span></span></li>)}</ul></section>
      <div className="grid g2">
        <section className="card"><div className="card-h"><h2>Where AI is, and is not, used</h2></div>
          <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }} className="ink2">
            <li><b>Calculate</b> metrics, deltas and risk bands in code.</li><li><b>Derive</b> insights, priorities, risks and actions with rules.</li><li><b>Register</b> each number as a numbered fact (F1, F2, …).</li>
            <li><b>Word</b> the facts: AI off lists them, rule-based writes prose from templates, LLM (optional) rewrites them.</li><li><b>Validate</b> that every number in the text exists in the fact list, or fall back to the deterministic summary.</li></ol>
          <div className={`notice ${meta.ai.llmAvailable ? "ok" : "info"}`} style={{ marginTop: 12 }}>{meta.ai.llmAvailable ? "An LLM key is configured. LLM mode is live and still grounding-checked." : "No LLM key is configured. LLM mode falls back to the rule-based generator. Everything else is unaffected."}</div></section>
        <section className="card"><div className="card-h"><h2>Known limits</h2></div>
          <ul className="reasons"><li>Enrollment is identical in all three months, so enrollment never moves.</li><li>Blocks with under 5 schools are flagged as small samples and left out of top-performer lists.</li><li>Grade and subject filters trust recorded attendance, not the “which classes” text answer, because the two disagree in many rows.</li><li>The finance spend plan is assumed linear across the three-month grant period.</li><li>Evidence assets are synthetic. Only records in the evidence index are ever cited.</li></ul></section>
      </div>
    </div>
  );
}
