import type { DashboardResponse, GeoRow, GradeSubjectCell, Selection } from "../../shared/types.js";
import { aggregate, delta, prevMonth, schoolStatus, statusMix } from "./metrics.js";
import { assess, classify, severity, THRESHOLDS } from "./risk.js";
import type { Store } from "./store.js";
import { GRADES, MONTHS, MONTH_LABEL, SUBJECTS } from "./types.js";
import type { SchoolRecord } from "./types.js";

export const LOW_SAMPLE = 5;

function groupBy<T>(rows: T[], key: (r: T) => string) {
  const m = new Map<string, T[]>();
  for (const r of rows) { const k = key(r); (m.get(k) ?? m.set(k, []).get(k)!).push(r); }
  return m;
}

/** Rows for districts (no district selected) or blocks (district selected or forced). */
export function geoRows(store: Store, sel: Selection, level?: "district" | "block"): GeoRow[] {
  const lvl = level ?? (sel.district ? "block" : "district");
  const cur = store.scope({ ...sel, block: undefined });
  const pm = prevMonth(sel.month);
  const prev = pm ? store.scope({ ...sel, block: undefined }, pm) : [];
  const key = (r: SchoolRecord) => (lvl === "district" ? r.district : r.block);
  const cg = groupBy(cur, key), pg = groupBy(prev, key);

  const rows: GeoRow[] = [...cg.entries()].map(([name, rs]) => {
    const agg = aggregate(rs, sel);
    const p = pm ? aggregate(pg.get(name) ?? [], sel) : null;
    const assessment = assess(agg);
    const shortfall = Math.max(0, THRESHOLDS.onTrack - agg.composite);
    return {
      level: lvl, name, district: rs[0].district, agg, prev: p, delta: delta(agg, p), assessment,
      studentsInGap: Math.round(agg.enrollment * shortfall), priority: "None", rank: 0,
      lowSample: agg.schools < LOW_SAMPLE, statusMix: statusMix(rs, sel),
    };
  });

  // rank by composite (1 = best)
  [...rows].sort((a, b) => b.agg.composite - a.agg.composite || a.name.localeCompare(b.name)).forEach((r, i) => (r.rank = i + 1));

  // priority: worst status first, then most students in the gap. Top 5 At Risk/Critical = P1.
  const ordered = [...rows].sort((a, b) => severity(a.assessment.status) - severity(b.assessment.status) || b.studentsInGap - a.studentsInGap);
  let p1 = 0;
  for (const r of ordered) {
    const st = r.assessment.status;
    if (st === "Critical" || st === "At Risk") r.priority = p1++ < 5 ? "P1" : "P2";
    else if (st === "Behind") r.priority = "P3";
  }

  if (lvl === "district") {
    const blocks = geoRows(store, { ...sel, district: undefined }, "block");
    const byD = groupBy(blocks, (b) => b.district);
    for (const r of rows) {
      const bs = byD.get(r.name) ?? [];
      r.childCount = bs.length;
      r.childAtRisk = bs.filter((b) => ["At Risk", "Critical"].includes(b.assessment.status)).length;
    }
  }
  return rows;
}

export function gradeSubjectMatrix(store: Store, sel: Selection): GradeSubjectCell[] {
  const cur = store.scope(sel);
  const pm = prevMonth(sel.month);
  const prev = pm ? store.scope(sel, pm) : null;
  const cell = (rs: SchoolRecord[], g: (typeof GRADES)[number], s: (typeof SUBJECTS)[number]) => {
    let a = 0, c = 0;
    for (const r of rs) { a += r.att[g][s]; c += r.enrollment[g]; }
    return { a, c };
  };
  const out: GradeSubjectCell[] = [];
  for (const g of GRADES) for (const s of SUBJECTS) {
    const { a, c } = cell(cur, g, s);
    const rate = c ? a / c : 0;
    const p = prev ? cell(prev, g, s) : null;
    out.push({ grade: g, subject: s, attendance: a, capacity: c, rate, status: classify(rate), prevRate: p && p.c ? p.a / p.c : null });
  }
  return out;
}

export function dashboard(store: Store, sel: Selection): DashboardResponse {
  const cur = store.scope(sel);
  const agg = aggregate(cur, sel);
  const pm = prevMonth(sel.month);
  const prevRows = pm ? store.scope(sel, pm) : null;
  const prev = prevRows ? aggregate(prevRows, sel) : null;
  const geoLevel = sel.district ? "block" : "district";
  const geos = geoRows(store, sel);
  const byComp = [...geos].sort((a, b) => b.agg.composite - a.agg.composite);
  const eligible = byComp.filter((g) => !g.lowSample);
  const pool = eligible.length >= 6 ? eligible : byComp;
  return {
    selection: sel, current: agg, previous: prev, delta: delta(agg, prev), assessment: assess(agg),
    trend: MONTHS.map((m) => ({ month: m, label: MONTH_LABEL[m].split(" ")[0], agg: aggregate(store.scope(sel, m), sel) })),
    schoolStatusMix: statusMix(cur, sel),
    prevSchoolStatusMix: prevRows ? statusMix(prevRows, sel) : null,
    top: pool.slice(0, 5),
    bottom: pool.slice(-5).reverse(),
    geoLevel,
    gradeSubject: gradeSubjectMatrix(store, sel),
    funnel: [
      { label: "Schools in scope", value: agg.schools },
      { label: "Ran a PBL project", value: agg.participating },
      { label: "Submitted evidence", value: agg.withEvidence },
      { label: "Attendance on track (≥75%)", value: cur.filter((r) => schoolStatus(r, sel) === "On Track").length },
    ],
  };
}
