import { useEffect, type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus, X } from "lucide-react";
import type { Assessment, GeoRow, RiskStatus } from "../../shared/types";
import { num, pct, pts, statusBar, statusClass, STATUSES } from "../lib";

export const StatusBadge = ({ s }: { s: RiskStatus }) => <span className={`badge ${statusClass(s)}`}><i />{s}</span>;

export function Delta({ v, kind = "pts", invert = false }: { v: number | null; kind?: "pts" | "count"; invert?: boolean }) {
  if (v == null) return <span className="muted" style={{ fontSize: 12 }}>no prior month</span>;
  const tiny = kind === "pts" ? Math.abs(v) < 0.0005 : v === 0;
  const up = v > 0; const good = invert ? !up : up;
  const text = kind === "pts" ? pts(v) : `${v >= 0 ? "+" : "−"}${Math.abs(v).toLocaleString("en-IN")}`;
  return <span className={`delta ${tiny ? "flat" : good ? "up" : "down"}`} title="Change vs previous reporting month">{tiny ? <Minus size={12} /> : up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{text}</span>;
}

const colorFor = (v: number) => (v >= 0.75 ? "var(--ok-bar)" : v >= 0.6 ? "var(--behind-bar)" : v >= 0.35 ? "var(--risk-bar)" : "var(--crit-bar)");

/** Signature element: the 0-35-60-75-100 band ruler with a pin for the current value and a caret for last month. */
export function RiskRuler({ value, prev, mini = false, ticks = false, label }: { value: number; prev?: number | null; mini?: boolean; ticks?: boolean; label?: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div role="img" aria-label={label ?? `Value ${pct(value)} on a scale with bands at 35, 60 and 75 percent`}>
      <div className={`ruler ${mini ? "mini" : ""}`}>
        <div className="seg-crit" /><div className="seg-risk" /><div className="seg-behind" /><div className="seg-ok" />
        <div className="fill" style={{ width: `${v * 100}%`, background: colorFor(v) }} />
        {prev != null && !mini && <div className="prev" style={{ left: `${Math.max(0, Math.min(1, prev)) * 100}%` }} title={`Previous month ${pct(prev)}`} />}
        <div className="pin" style={{ left: `${v * 100}%` }} />
      </div>
      {ticks && <div className="ruler-ticks" aria-hidden><span style={{ left: 0 }}>0</span><span style={{ left: "35%" }}>35</span><span style={{ left: "60%" }}>60</span><span style={{ left: "75%" }}>75</span><span style={{ left: "100%" }}>100%</span></div>}
    </div>
  );
}

export function Sparkline({ values, w = 84, h = 28 }: { values: number[]; w?: number; h?: number }) {
  if (values.length < 2) return null;
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  const pts_ = values.map((v, i) => [4 + (i * (w - 8)) / (values.length - 1), 4 + (h - 8) * (1 - (v - lo) / span)]);
  const d = pts_.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const last = pts_[pts_.length - 1];
  return <svg width={w} height={h} role="img" aria-label={`Trend across ${values.length} months`}><path d={d} fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><circle cx={last[0]} cy={last[1]} r="3.2" fill="var(--primary)" /></svg>;
}

export const Skeleton = ({ h = 120 }: { h?: number }) => <div className="skel" style={{ height: h }} aria-hidden />;
export const Empty = ({ title, children }: { title: string; children?: ReactNode }) => <div className="empty"><b>{title}</b>{children}</div>;
export const ErrorBox = ({ msg }: { msg: string }) => <div className="err" role="alert"><b>Something went wrong.</b> {msg}</div>;

export function StatusMix({ mix, total }: { mix: Record<RiskStatus, number>; total: number }) {
  return (
    <div>
      <div className="stack" role="img" aria-label={STATUSES.map((s) => `${s}: ${mix[s]}`).join(", ")}>
        {STATUSES.map((s) => mix[s] > 0 && <div key={s} className={statusBar(s)} style={{ flex: mix[s] }} title={`${s}: ${num(mix[s])}`}>{mix[s] / total > 0.07 ? num(mix[s]) : ""}</div>)}
      </div>
      <div className="legend">{STATUSES.map((s) => <span key={s}><i className={statusBar(s)} />{s} · {num(mix[s])}</span>)}</div>
    </div>
  );
}

export function Drawer({ title, sub, onClose, children }: { title: ReactNode; sub?: ReactNode; onClose: () => void; children: ReactNode }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Explanation">
        <div className="drawer-h"><div><h2 style={{ fontSize: 18, letterSpacing: "-.01em" }}>{title}</h2>{sub}</div><button className="btn ghost sm" onClick={onClose} aria-label="Close"><X size={16} /></button></div>
        <div className="drawer-b">{children}</div>
      </aside>
    </>
  );
}

export function AssessmentView({ a, prev }: { a: Assessment; prev?: { participation: number | null; evidence: number | null; attendance: number | null } }) {
  return (
    <>
      <ul className="reasons">{a.reasons.slice(0, 2).map((r, i) => <li key={i}>{r}</li>)}</ul>
      {a.indicators.map((i) => (
        <div className="ind" key={i.key}>
          <div className="ind-top"><b>{i.label}</b><span style={{ display: "flex", gap: 8, alignItems: "center" }}><span className="num" style={{ fontWeight: 800, fontSize: 16 }}>{pct(i.value)}</span><StatusBadge s={i.status} /></span></div>
          <RiskRuler value={i.value} prev={prev && prev[i.key] != null ? i.value - (prev[i.key] as number) : null} ticks />
          <div className="muted" style={{ fontSize: 12 }}>
            {i.nextBand ? (i.nextBand.status === "On Track" ? `+${i.nextBand.pointsNeeded.toFixed(1)} pts to On Track.` : `+${i.nextBand.pointsNeeded.toFixed(1)} pts to ${i.nextBand.status}; +${i.gapToOnTrack.toFixed(1)} pts to On Track.`) : "Meets the On Track standard (75% or above)."}
          </div>
        </div>
      ))}
    </>
  );
}

export function GeoExplain({ g, onClose, onDrill }: { g: GeoRow; onClose: () => void; onDrill?: () => void }) {
  const d = g.delta;
  return (
    <Drawer onClose={onClose} title={g.name} sub={<div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}><StatusBadge s={g.assessment.status} />{g.priority !== "None" && <span className={`pill ${g.priority.toLowerCase()}`}>{g.priority} follow-up</span>}<span className="muted">{g.level === "block" ? g.district + " · " : ""}Rank {g.rank} by composite score</span></div>}>
      {g.lowSample && <div className="notice">Only {g.agg.schools} schools reported here. Treat percentages as indicative and verify with the field team.</div>}
      <div><h3 style={{ fontSize: 13, marginBottom: 8 }}>Why this status</h3>
        <AssessmentView a={g.assessment} prev={{ participation: d.participationRate, evidence: d.evidenceRate, attendance: d.attendanceRate }} />
      </div>
      <div><h3 style={{ fontSize: 13, marginBottom: 8 }}>Schools and students</h3>
        <div className="kv"><span>Schools</span><span>{num(g.agg.schools)}</span><span>Ran PBL</span><span>{num(g.agg.participating)} <Delta v={d.participating} kind="count" /></span><span>Submitted evidence</span><span>{num(g.agg.withEvidence)} <Delta v={d.withEvidence} kind="count" /></span><span>Enrollment</span><span>{num(g.agg.enrollment)}</span><span>Students in the gap to 75%</span><span>{num(g.studentsInGap)}</span><span>Composite score</span><span>{pct(g.agg.composite)} <Delta v={d.composite} /></span></div>
      </div>
      <div><h3 style={{ fontSize: 13, marginBottom: 8 }}>School-level status</h3>
        <StatusMix mix={g.statusMix} total={g.agg.schools} />
      </div>
      {onDrill && g.childCount ? <button className="btn primary" onClick={onDrill}>Open {g.childCount} blocks ({g.childAtRisk} At Risk or Critical)</button> : null}
      <p className="muted" style={{ fontSize: 12 }}>The caret on each ruler marks last month. Priority ranks status severity first, then the number of students below the 75% target.</p>
    </Drawer>
  );
}
