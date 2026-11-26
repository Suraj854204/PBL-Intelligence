import { useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link } from "react-router-dom";
import type { DashboardResponse, GeoRow, Aggregate } from "../../shared/types";
import { Delta, ErrorBox, GeoExplain, RiskRuler, Skeleton, Sparkline, StatusBadge, StatusMix, AssessmentView, Drawer, Empty } from "../components/ui";
import { num, pct, qs, scopeName, statusClass, useApi } from "../lib";
import { useApp } from "../state";
import { HelpCircle } from "lucide-react";

function Kpi({ label, value, sub, delta, dkind, spark, ruler, prev, small, hint }: { label: string; value: string; sub?: string; delta: number | null; dkind?: "pts" | "count"; spark?: number[]; ruler?: number; prev?: number | null; small?: boolean; hint?: string }) {
  return (
    <div className={`card kpi ${small ? "small" : ""}`}>
      <div className="kpi-top"><span className="kpi-label" title={hint}>{label}</span><Delta v={delta} kind={dkind} /></div>
      <div className="kpi-value num">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
      {ruler != null && <RiskRuler value={ruler} prev={prev} ticks />}
      {spark && <div className="kpi-foot"><span className="muted" style={{ fontSize: 11.5 }}>Jul → Sep</span><Sparkline values={spark} /></div>}
    </div>
  );
}


export default function Overview() {
  const { sel, setSel } = useApp();
  const { data: d, error, loading } = useApi<DashboardResponse>(`/api/dashboard?${qs(sel)}`);
  const [geo, setGeo] = useState<GeoRow | null>(null);
  const [why, setWhy] = useState(false);
  if (error) return <div className="page"><ErrorBox msg={error} /></div>;
  if (!d) return <div className="page"><Skeleton h={60} /><div className="grid g3"><Skeleton h={190} /><Skeleton h={190} /><Skeleton h={190} /></div><Skeleton h={300} /></div>;
  const A = d.current, P = d.previous, dl = d.delta, tr = d.trend.map((t) => t.agg);
  const trendData = d.trend.map((t) => ({ month: t.label, Participation: +(t.agg.participationRate * 100).toFixed(1), Evidence: +(t.agg.evidenceRate * 100).toFixed(1), Attendance: +(t.agg.attendanceRate * 100).toFixed(1) }));
  const lvl = d.geoLevel === "block" ? "block" : "district";
  const filtered = sel.grades.length || sel.subjects.length;
  const prevOf = (k: keyof Aggregate) => (P ? (P[k] as number) : null);
  return (
    <div className="page" style={{ opacity: loading ? 0.6 : 1, transition: "opacity .15s" }}>
      <div className="page-head">
        <div>
          <h1>{scopeName(sel)} · {d.trend.find((t) => t.month === sel.month)?.label} 2025</h1>
          <p>{filtered ? `Showing ${sel.grades.length ? "Class " + sel.grades.join(", ") : "all classes"}${sel.subjects.length ? " · " + sel.subjects.join(" + ") : ""}. ` : ""}{num(A.schools)} schools. Overall status is set by the weakest of participation, evidence and attendance.</p>
        </div>
        <div className="actions-row">
          <StatusBadge s={d.assessment.status} />
          <button className="btn" onClick={() => setWhy(true)}><HelpCircle size={14} />Why {d.assessment.status}?</button>
          <Link className="btn primary" to={{ pathname: "/review", search: location.search }}>Prepare review</Link>
        </div>
      </div>

      <div className="grid g3">
        <Kpi label="PBL participation" value={pct(A.participationRate)} delta={dl.participationRate} ruler={A.participationRate} prev={prevOf("participationRate")} spark={tr.map((a) => a.participationRate)} sub={`${num(A.participating)} of ${num(A.schools)} schools ran a project`} hint="Schools that ran PBL ÷ all schools in scope" />
        <Kpi label="Evidence submission" value={pct(A.evidenceRate)} delta={dl.evidenceRate} ruler={A.evidenceRate} prev={prevOf("evidenceRate")} spark={tr.map((a) => a.evidenceRate)} sub={`${num(A.withEvidence)} schools · ${pct(A.evidenceOfParticipating, 0)} of those that ran PBL`} hint="Schools that submitted evidence ÷ all schools in scope" />
        <Kpi label="Attendance" value={pct(A.attendanceRate)} delta={dl.attendanceRate} ruler={A.attendanceRate} prev={prevOf("attendanceRate")} spark={tr.map((a) => a.attendanceRate)} sub={`${num(A.attendance)} of ${num(A.capacity)} expected seat-sessions`} hint="Attendance summed over Science and Math sessions ÷ (enrollment × sessions per class)" />
      </div>
      <div className="grid g4">
        <Kpi small label="Total schools" value={num(A.schools)} delta={null} sub="Reporting each month" />
        <Kpi small label="Participating schools" value={num(A.participating)} delta={dl.participating} dkind="count" spark={tr.map((a) => a.participating)} />
        <Kpi small label="Total enrollment" value={num(A.enrollment)} delta={P ? A.enrollment - P.enrollment : null} dkind="count" sub="Classes 6 to 8, fixed across months" />
        <Kpi small label="Attendance (student-sessions)" value={num(A.attendance)} delta={dl.attendance} dkind="count" spark={tr.map((a) => a.attendance)} />
      </div>

      <div className="grid g-main">
        <section className="card" aria-labelledby="t1">
          <div className="card-h"><h2 id="t1">Trend against the 75% standard</h2><small>Dashed lines mark 75% and 60%</small></div>
          <div style={{ height: 270 }}>
            <ResponsiveContainer>
              <LineChart data={trendData} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: "var(--ink-3)", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} unit="%" tick={{ fill: "var(--ink-3)", fontSize: 12 }} axisLine={false} tickLine={false} />
                <ReferenceLine y={75} stroke="var(--ok-bar)" strokeDasharray="5 4" /><ReferenceLine y={60} stroke="var(--behind-bar)" strokeDasharray="5 4" />
                <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 12 }} formatter={(v: number) => `${v}%`} />
                <Line type="monotone" dataKey="Participation" stroke="#0e6b73" strokeWidth={2.5} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="Evidence" stroke="#7a5af8" strokeWidth={2.5} dot={{ r: 4 }} strokeDasharray="0" />
                <Line type="monotone" dataKey="Attendance" stroke="#e8a317" strokeWidth={2.5} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="legend"><span><i style={{ background: "#0e6b73" }} />Participation</span><span><i style={{ background: "#7a5af8" }} />Evidence</span><span><i style={{ background: "#e8a317" }} />Attendance</span></div>
        </section>
        <section className="card" aria-labelledby="t2">
          <div className="card-h"><h2 id="t2">School status</h2><small>{filtered ? "for selected class/subject" : "attendance band per school"}</small></div>
          <StatusMix mix={d.schoolStatusMix} total={A.schools} />
          <h3 style={{ fontSize: 13, margin: "20px 0 10px" }}>From schools to students</h3>
          <div className="funnel">{d.funnel.map((f) => <div className="funnel-row" key={f.label}><span>{f.label}</span><div className="funnel-bar"><div style={{ width: `${(f.value / (d.funnel[0].value || 1)) * 100}%` }} /></div><b className="num" style={{ textAlign: "right" }}>{num(f.value)}</b></div>)}</div>
        </section>
      </div>

      <div className="grid g2">
        <GeoList title={`Needs follow-up first`} sub={`Lowest ${lvl}s by composite score`} rows={d.bottom} onPick={setGeo} />
        <GeoList title={`Strongest ${lvl}s`} sub={`Highest composite score, small samples last`} rows={d.top} onPick={setGeo} />
      </div>

      <div className="grid g-main">
        <section className="card" aria-labelledby="t3">
          <div className="card-h"><h2 id="t3">Class and subject attendance</h2><small>{scopeName(sel)}</small></div>
          <div className="heat" style={{ gridTemplateColumns: "70px repeat(2, 1fr)" }}>
            <span />{["Science", "Math"].map((s) => <span key={s} className="hh">{s}</span>)}
            {[6, 7, 8].flatMap((g) => [<span key={`h${g}`} className="hh">Class {g}</span>, ...(["Science", "Math"] as const).map((s) => {
              const c = d.gradeSubject.find((x) => x.grade === g && x.subject === s)!;
              const act = (!sel.grades.length || sel.grades.includes(g as 6)) && (!sel.subjects.length || sel.subjects.includes(s));
              return <button key={`${g}${s}`} className={`cell ${statusClass(c.status)}`} style={{ border: 0, opacity: act ? 1 : 0.35, textAlign: "left" }} onClick={() => setSel({ grades: [g as 6], subjects: [s] })} title="Click to filter to this class and subject"><b className="num">{pct(c.rate)}</b><small>{c.status}{c.prevRate != null ? ` · ${c.rate - c.prevRate >= 0 ? "+" : "−"}${Math.abs((c.rate - c.prevRate) * 100).toFixed(1)} pts` : ""}</small></button>;
            })])}
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>Session attendance ÷ enrollment for that class. Click a cell to filter the whole dashboard to it.</p>
        </section>
        <section className="card" aria-labelledby="t4">
          <div className="card-h"><h2 id="t4">How the status is decided</h2></div>
          <AssessmentView a={d.assessment} prev={{ participation: dl.participationRate, evidence: dl.evidenceRate, attendance: dl.attendanceRate }} />
        </section>
      </div>

      {geo && <GeoExplain g={geo} onClose={() => setGeo(null)} onDrill={geo.level === "district" ? () => { setSel({ district: geo.name }); setGeo(null); } : undefined} />}
      {why && <Drawer title={`Why ${scopeName(sel)} is ${d.assessment.status}`} onClose={() => setWhy(false)}><AssessmentView a={d.assessment} prev={{ participation: dl.participationRate, evidence: dl.evidenceRate, attendance: dl.attendanceRate }} /></Drawer>}
    </div>
  );
}

function GeoList({ title, sub, rows, onPick }: { title: string; sub: string; rows: GeoRow[]; onPick: (g: GeoRow) => void }) {
  return (
    <section className="card">
      <div className="card-h"><h2>{title}</h2><small>{sub}</small></div>
      {rows.length === 0 ? <Empty title="Nothing to rank">Pick a wider scope to compare geographies.</Empty> : (
        <div className="rank-list">{rows.map((g) => (
          <button key={g.name} className="rank-row" onClick={() => onPick(g)} aria-label={`Explain ${g.name}`}>
            <span className="rank-no">{g.rank}</span>
            <span className="rank-name"><b>{g.name.replace(/^District \w+ - /, "")}{g.level === "block" ? <span className="muted" style={{ fontWeight: 500 }}> · {g.district}</span> : ""}</b><small>Attendance {pct(g.agg.attendanceRate)} · evidence {pct(g.agg.evidenceRate, 0)} · {num(g.agg.schools)} {g.agg.schools === 1 ? "school" : "schools"}</small></span>
            <RiskRuler value={g.agg.composite} mini />
            <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}><StatusBadge s={g.assessment.status} /><Delta v={g.delta.composite} /></span>
          </button>))}</div>
      )}
    </section>
  );
}
