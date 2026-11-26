import { useState } from "react";
import { CheckCircle2, CircleAlert, CircleDashed, X } from "lucide-react";
import type { GrantResponse, NarrativeMode } from "../../shared/types";
import { Delta, ErrorBox, RiskRuler, Skeleton, StatusBadge } from "../components/ui";
import { ModeToggle, NarrativeView } from "../components/Narrative";
import { num, pct, useApi } from "../lib";
import { useApp } from "../state";

const flagCls = (f: string) => (f === "On pace" ? "st-on-track" : f === "Slightly behind pace" ? "st-behind" : "st-at-risk");
const msIcon = (s: string) => (/complete/i.test(s) ? <CheckCircle2 size={16} color="var(--ok)" /> : /risk/i.test(s) ? <CircleAlert size={16} color="var(--risk)" /> : <CircleDashed size={16} color="var(--ink-3)" />);

export default function Grants() {
  const { meta, sel } = useApp();
  const [gid, setGid] = useState(meta.grants[0].grantId);
  const [mode, setMode] = useState<NarrativeMode>("mock");
  const [zoom, setZoom] = useState<GrantResponse["facts"]["evidence"][number] | null>(null);
  const { data, error, loading } = useApi<GrantResponse>(`/api/grants/${gid}/${sel.month}?mode=${mode}`);
  const grant = meta.grants.find((g) => g.grantId === gid)!;
  if (error) return <div className="page"><ErrorBox msg={error} /></div>;
  const f = data?.facts;
  const P = f?.performance, pv = f?.prevPerformance;
  const ok = f?.reconciliation.every((r) => r.match);
  return (
    <div className="page" style={{ opacity: loading && data ? 0.7 : 1, transition: "opacity .15s" }}>
      <div className="page-head">
        <div><h1>Grant report builder</h1><p>Pick a grant and a reporting month. The fact panel is computed from finance, performance and survey data; the report text below is assembled only from those facts.</p></div>
        <div className="fgroup"><label className="flabel" htmlFor="g-sel">Grant</label>
          <select id="g-sel" className="select" style={{ maxWidth: 260 }} value={gid} onChange={(e) => setGid(e.target.value)}>{meta.grants.map((g) => <option key={g.grantId} value={g.grantId}>{g.name} ({g.donor})</option>)}</select></div>
      </div>
      {!f || !P ? <><div className="grid g3"><Skeleton h={170} /><Skeleton h={170} /><Skeleton h={170} /></div><Skeleton h={360} /></> : (<>
        <div className="card" style={{ display: "flex", flexWrap: "wrap", gap: "10px 24px", alignItems: "center" }}>
          <div><b style={{ fontSize: 16 }}>{f.name}</b><div className="muted">{f.donor} · {f.periodStart} to {f.periodEnd}</div></div>
          <div className="chips" aria-label="Covered districts">{f.districts.map((d) => <span className="chip" key={d}>{d}</span>)}</div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span className="muted">Report {f.reportStatus.toLowerCase()} · due {f.reportDue}</span><StatusBadge s={f.assessment.status} />
          </div>
        </div>

        <div className="grid g3">
          {([["PBL completion", P.completionRate, pv && P.completionRate - pv.completionRate, `${num(P.completed)} of ${num(P.sampled)} schools`, pv?.completionRate], ["Evidence submission", P.evidenceRate, pv && P.evidenceRate - pv.evidenceRate, `${num(P.withEvidence)} schools`, pv?.evidenceRate], ["Attendance", P.attendanceRate, pv && P.attendanceRate - pv.attendanceRate, `${num(P.attendance)} of ${num(P.enrollment * 2)} seat-sessions`, pv?.attendanceRate]] as const).map(([l, v, d, sub, prev]) => (
            <div className="card kpi" key={l}><div className="kpi-top"><span className="kpi-label">{l}</span><Delta v={d ?? null} /></div><div className="kpi-value num">{pct(v)}</div><div className="kpi-sub">{sub}</div><RiskRuler value={v} prev={prev ?? null} ticks /></div>))}
        </div>

        <div className="grid g-grant">
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <section className="card"><div className="card-h"><h2>Finance utilization</h2><span className={`badge ${flagCls(f.finance.flag)}`}><i />{f.finance.flag}</span></div>
              <div className="kpi-value num" style={{ fontSize: 28 }}>{pct(f.finance.utilization)}</div>
              <div className="kpi-sub" style={{ marginBottom: 12 }}>{num(f.finance.cumulative)} of {num(f.finance.approved)} units used · plan at month end {pct(f.finance.expectedUtilization, 0)} · {num(f.finance.monthly)} this month</div>
              <div className="tbl-wrap"><table><thead><tr><th>Budget line</th><th className="r">Approved</th><th className="r">Used</th><th>Against plan</th></tr></thead>
                <tbody>{f.finance.lines.map((l) => <tr key={l.line}><td>{l.line}</td><td className="r num">{num(l.approved)}</td><td className="r num">{num(l.cumulative)}</td><td style={{ minWidth: 120 }}><div className="pace" title={`${pct(l.rate)} used; plan ${pct(l.expectedRate, 0)}`}><div className="u" style={{ width: `${Math.min(100, l.rate * 100)}%` }} /><div className="e" style={{ left: `${l.expectedRate * 100}%` }} /></div><span className="muted num" style={{ fontSize: 11.5 }}>{pct(l.rate)} · plan {pct(l.expectedRate, 0)}</span></td></tr>)}</tbody></table></div>
              <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Finance notes in the file read “{[...new Set(f.finance.lines.map((l) => l.note))].join(", ")}”. The pace flag is computed from a linear three-month spend plan.</p>
            </section>
            <section className="card"><div className="card-h"><h2>Milestones</h2></div>
              <ul className="ins-list">{f.milestones.map((m) => <li className="ins" key={m.name}>{msIcon(m.status)}<span><b>{m.name}</b><br /><span className="muted">{m.status} · {m.owner}</span></span></li>)}</ul></section>
            <section className="card"><div className="card-h"><h2>Risks to report</h2><small>from rules, not AI</small></div>
              {f.risks.length === 0 ? <p className="muted">No risks flagged.</p> : <ul className="ins-list">{f.risks.map((r) => <li className="ins" key={r.id}><span className={`dot ${r.level === "high" ? "critical" : r.level === "medium" ? "warning" : "neutral"}`} aria-hidden /><span>{r.text} <span className="muted" style={{ fontSize: 11.5 }}>({r.level})</span></span></li>)}</ul>}</section>
            <section className="card"><div className="card-h"><h2>Covered districts</h2><small>lowest composite first</small></div>
              <div className="tbl-wrap"><table><thead><tr><th>District</th><th>Status</th><th className="r">Attendance</th><th className="r">Evidence</th></tr></thead><tbody>{f.districtBreakdown.map((d) => <tr key={d.district}><td className="name-cell">{d.district}<small>{num(d.agg.schools)} schools</small></td><td><StatusBadge s={d.status} /></td><td className="r num">{pct(d.agg.attendanceRate)}</td><td className="r num">{pct(d.agg.evidenceRate)}</td></tr>)}</tbody></table></div></section>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="actions-row no-print"><span className="flabel">Report text</span><ModeToggle mode={mode} setMode={setMode} /></div>
            {data && <NarrativeView n={data.narrative} filename={`${gid.toLowerCase()}-${sel.month}-${mode}`} />}
          </div>
        </div>

        <section className="card"><div className="card-h"><h2>Linked evidence and media</h2><small>{f.evidence.length} record(s) up to {sel.month}</small></div>
          {f.evidence.length === 0 ? <p className="muted">No evidence assets are linked to this grant for the selected month or earlier.</p> : <div className="evg">{f.evidence.map((e) => (
            <button className="ev" key={e.id} onClick={() => setZoom(e)}><img src={e.url} alt={`${e.title} (synthetic)`} loading="lazy" /><div><b>{e.title}</b><span className="muted">{e.id} · {e.district}</span><br /><span className="synth">Synthetic</span>{" "}{e.sameMonth ? <span className="pill">this month</span> : <span className="pill">earlier month</span>}</div></button>))}</div>}
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>Only records listed in the evidence index for this grant are shown. All assets are synthetic and are not field records.</p>
        </section>

        <details className="card"><summary>Reconciliation: grant file vs survey data {ok ? "✓ all match" : "⚠ differences found"}</summary>
          <div className="tbl-wrap" style={{ marginTop: 12 }}><table><thead><tr><th>Metric</th><th className="r">Grant file</th><th className="r">Recomputed from survey rows</th><th>Match</th></tr></thead><tbody>{f.reconciliation.map((r) => <tr key={r.metric}><td>{r.metric}</td><td className="r num">{r.source < 1.5 && r.source % 1 ? pct(r.source, 2) : num(r.source)}</td><td className="r num">{r.recomputed < 1.5 && r.recomputed % 1 ? pct(r.recomputed, 2) : num(r.recomputed)}</td><td>{r.match ? "✓" : "✗"}</td></tr>)}</tbody></table></div></details>
        <details className="card"><summary>Draft text supplied in the grant file (for comparison)</summary><p className="ink2" style={{ marginTop: 10 }}>{f.sourceDraft}</p><p className="muted" style={{ fontSize: 12, marginTop: 6 }}>Source status “{P.sourceRisk}” is attendance-based; this app reports the weakest of three indicators, which is {f.assessment.status}.</p></details>
      </>)}
      {zoom && <div className="lightbox" onClick={() => setZoom(null)} role="dialog" aria-modal="true" aria-label={zoom.title}><figure onClick={(e) => e.stopPropagation()}><img src={zoom.url} alt={`${zoom.title} (synthetic)`} /><figcaption><b>{zoom.title}</b> · {zoom.id} · {zoom.district}<br />{zoom.caption}<br /><span className="muted">{zoom.usage}</span><div><button className="btn sm" style={{ marginTop: 8 }} onClick={() => setZoom(null)}><X size={13} />Close</button></div></figcaption></figure></div>}
    </div>
  );
}
