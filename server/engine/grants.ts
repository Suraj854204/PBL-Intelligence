import path from "node:path";
import type { BudgetLine, GrantFacts, GrantFactsWithRefs, Month, RiskStatus, Selection } from "../../shared/types.js";
import { DATA_DIR, readCsvObjects } from "./loader.js";
import { aggregate } from "./metrics.js";
import { assess, classify, pct, severity } from "./risk.js";
import type { Store } from "./store.js";
import { MONTHS, MONTH_LABEL } from "./types.js";
import { FactBook } from "../narrative/facts.js";

type Row = Record<string, string>;
export interface GrantData { finance: Row[]; perf: Row[]; media: Row[] }

export function loadGrantData(dir = DATA_DIR): GrantData {
  const g = path.join(dir, "grants");
  return {
    finance: readCsvObjects(path.join(g, "01_Grant_Profile_and_Finance.csv")),
    perf: readCsvObjects(path.join(g, "02_Grant_Performance_and_Report_Material.csv")),
    media: readCsvObjects(path.join(g, "03_Evidence_and_Media_Index.csv")),
  };
}

export function grantList(gd: GrantData) {
  const ids = [...new Set(gd.perf.map((r) => r.grant_id))];
  return ids.map((id) => {
    const r = gd.perf.find((x) => x.grant_id === id)!;
    return { grantId: id, donor: r.donor, name: r.grant_name, districts: r.covered_districts.split("; "), months: gd.perf.filter((x) => x.grant_id === id).map((x) => x.reporting_month as Month) };
  });
}

const n = (v: string) => Number(v);
const parseMilestones = (s: string) => s.split("|").map((p) => p.trim()).filter(Boolean).map((p) => {
  const m = p.match(/^(.*?):\s*(.*?)\s*\((.*)\)$/);
  return m ? { name: m[1], status: m[2], owner: m[3] } : { name: p, status: "Unknown", owner: "" };
});

export function grantFacts(store: Store, gd: GrantData, grantId: string, month: Month): GrantFactsWithRefs | null {
  const p = gd.perf.find((r) => r.grant_id === grantId && r.reporting_month === month);
  if (!p) return null;
  const districts = p.covered_districts.split("; ");
  const sel = (m: Month): Selection => ({ month: m, grades: [], subjects: [] });
  const scopeRows = (m: Month) => store.monthRows(m).filter((r) => districts.includes(r.district));
  const agg = aggregate(scopeRows(month), sel(month));
  const assessment = assess(agg);

  const mi = MONTHS.indexOf(month);
  const prevP = mi > 0 ? gd.perf.find((r) => r.grant_id === grantId && r.reporting_month === MONTHS[mi - 1]) : undefined;

  // ---- finance
  const expected = (mi + 1) / MONTHS.length; // linear spend plan across the 3-month grant period
  const lines: BudgetLine[] = gd.finance.filter((r) => r.grant_id === grantId && r.reporting_month === month).map((r) => ({
    line: r.budget_line, approved: n(r.approved_budget_units), monthly: n(r.monthly_utilized_units), cumulative: n(r.cumulative_utilized_units),
    rate: n(r.cumulative_utilization_rate), expectedRate: expected, variance: n(r.cumulative_utilization_rate) - expected, note: r.finance_note,
  }));
  const approved = lines.reduce((s, l) => s + l.approved, 0), cumulative = lines.reduce((s, l) => s + l.cumulative, 0), monthly = lines.reduce((s, l) => s + l.monthly, 0);
  const utilization = approved ? cumulative / approved : 0;
  const variance = utilization - expected;
  const flag = variance >= -0.05 ? "On pace" : variance >= -0.15 ? "Slightly behind pace" : "Behind pace";

  // ---- evidence
  const fin0 = gd.finance.find((r) => r.grant_id === grantId)!;
  const evidence = gd.media.filter((m) => m.grant_id === grantId && MONTHS.indexOf(m.reporting_month as Month) <= mi).map((m) => ({
    id: m.record_id, type: m.record_type, district: m.district, title: m.title, caption: m.summary_or_caption,
    url: `/evidence/${m.relative_path.replace(/^images\//, "")}`, usage: m.usage_note, month: m.reporting_month as Month, sameMonth: m.reporting_month === month,
  }));

  // ---- district drivers
  const districtBreakdown = districts.map((d) => {
    const a = aggregate(store.monthRows(month).filter((r) => r.district === d), sel(month));
    return { district: d, agg: a, status: assess(a).status };
  }).sort((a, b) => a.agg.composite - b.agg.composite);

  // ---- reconciliation vs the grant file
  const rec = (metric: string, source: number, recomputed: number, tol = 0.00051) => ({ metric, source, recomputed, match: Math.abs(source - recomputed) <= tol });
  const reconciliation = [
    rec("Schools sampled", n(p.sampled_school_records), agg.schools, 0),
    rec("Schools completing PBL", n(p.schools_completed_pbl), agg.participating, 0),
    rec("PBL completion rate", n(p.pbl_completion_rate), agg.participationRate),
    rec("Schools with evidence", n(p.schools_with_evidence), agg.withEvidence, 0),
    rec("Evidence submission rate", n(p.evidence_submission_rate), agg.evidenceRate),
    rec("Total enrollment", n(p.total_enrollment), agg.enrollment, 0),
    rec("Total attendance", n(p.total_attendance), agg.attendance, 0),
    rec("Attendance rate", n(p.attendance_rate), agg.attendanceRate),
  ];

  const milestones = parseMilestones(p.milestone_summary);
  const sourceRisk = p.risk_status as RiskStatus;

  const base: GrantFacts = {
    grantId, donor: p.donor, name: p.grant_name, month, periodStart: fin0.period_start, periodEnd: fin0.period_end,
    reportDue: p.report_due_date, reportStatus: p.report_status, districts,
    performance: {
      sampled: n(p.sampled_school_records), completed: n(p.schools_completed_pbl), completionRate: n(p.pbl_completion_rate),
      withEvidence: n(p.schools_with_evidence), evidenceRate: n(p.evidence_submission_rate), enrollment: n(p.total_enrollment),
      attendance: n(p.total_attendance), attendanceRate: n(p.attendance_rate), sourceRisk,
    },
    assessment,
    prevPerformance: prevP ? { completionRate: n(prevP.pbl_completion_rate), evidenceRate: n(prevP.evidence_submission_rate), attendanceRate: n(prevP.attendance_rate) } : null,
    finance: { approved, monthly, cumulative, utilization, expectedUtilization: expected, variance, lines, flag },
    milestones, risks: [], evidence, districtBreakdown, reconciliation, sourceDraft: p.draft_report_text,
  };

  const fb = registerFacts(base);
  base.risks = deriveRisks(base, fb);
  return { ...base, factRefs: fb.all };
}

/** Fact registry for a grant-month. Keys are stable so the narrative can look them up by key. */
export function registerFacts(g: GrantFacts): FactBook {
  const fb = new FactBook();
  const mLabel = MONTH_LABEL[g.month];
  const P = g.performance, pm = g.prevPerformance;
  fb.add("grant", "Grant", g.name, g.name, "Grant profile (file 01)");
  fb.add("donor", "Donor", g.donor, g.donor, "Grant profile (file 01)");
  fb.add("month", "Reporting month", g.month, mLabel, "Selected reporting month");
  fb.add("districts", "Covered districts", g.districts.join("; "), g.districts.join(", "), "Grant profile (file 01)");
  fb.add("sampled", "Schools in sample", P.sampled, P.sampled.toLocaleString("en-IN"), "Performance file, reconciled to survey rows");
  fb.add("completed", "Schools that completed PBL", P.completed, P.completed.toLocaleString("en-IN"), "Performance file, reconciled to survey rows");
  fb.add("completion", "PBL completion rate", P.completionRate, pct(P.completionRate), "Completed ÷ sampled schools");
  fb.add("withEvidence", "Schools with evidence", P.withEvidence, P.withEvidence.toLocaleString("en-IN"), "Performance file, reconciled to survey rows");
  fb.add("evidence", "Evidence submission rate", P.evidenceRate, pct(P.evidenceRate), "Schools with evidence ÷ sampled schools");
  fb.add("attendance", "Attendance rate", P.attendanceRate, pct(P.attendanceRate), "Attendance ÷ (2 sessions × enrollment)");
  fb.add("enrollment", "Total enrollment", P.enrollment, P.enrollment.toLocaleString("en-IN"), "Classes 6–8 enrollment across covered districts");
  fb.add("status", "Risk status", g.assessment.status, g.assessment.status, "Weakest indicator vs 75/60/35 thresholds");
  const weak = g.assessment.indicators.find((i) => i.key === g.assessment.primaryGap)!;
  fb.add("weak", "Weakest indicator", weak.label, weak.label.toLowerCase(), "Lowest of three indicators");
  fb.add("weakGap", "Points to On Track (weakest indicator)", weak.gapToOnTrack, `${weak.gapToOnTrack.toFixed(1)} pts`, "75% minus weakest indicator");
  if (pm) {
    const d = (k: string, label: string, cur: number, prev: number) => {
      const v = (cur - prev) * 100;
      fb.add(k, `${label}: change vs previous month`, v, `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)} pts`, "Selected month minus previous month");
    };
    d("dCompletion", "PBL completion", P.completionRate, pm.completionRate);
    d("dEvidence", "Evidence submission", P.evidenceRate, pm.evidenceRate);
    d("dAttendance", "Attendance", P.attendanceRate, pm.attendanceRate);
  }
  const F = g.finance;
  fb.add("budget", "Approved budget (units)", F.approved, F.approved.toLocaleString("en-IN"), "Finance file, sum of budget lines");
  fb.add("spentCum", "Cumulative utilized (units)", F.cumulative, F.cumulative.toLocaleString("en-IN"), "Finance file, sum of budget lines");
  fb.add("spentMonth", "Utilized this month (units)", F.monthly, F.monthly.toLocaleString("en-IN"), "Finance file, sum of budget lines");
  fb.add("util", "Cumulative utilization", F.utilization, pct(F.utilization), "Cumulative ÷ approved");
  fb.add("pace", "Planned pace at month end", F.expectedUtilization, pct(F.expectedUtilization, 0), "Linear plan: months elapsed ÷ 3");
  fb.add("paceVar", "Variance to planned pace", F.variance * 100, `${F.variance >= 0 ? "+" : "−"}${Math.abs(F.variance * 100).toFixed(1)} pts`, "Utilization minus planned pace");
  fb.add("paceFlag", "Finance pacing flag", F.flag, F.flag, "Variance bands: ≥ −5 pts on pace; ≥ −15 slightly behind");
  g.milestones.forEach((m, i) => fb.add(`ms${i}`, `Milestone: ${m.name}`, m.status, `${m.name}: ${m.status} (${m.owner})`, "Milestone summary (file 02)"));
  fb.add("reportStatus", "Report status", g.reportStatus, g.reportStatus, "Performance file (02)");
  fb.add("reportDue", "Report due date", g.reportDue, g.reportDue, "Performance file (02)");
  g.districtBreakdown.slice(0, 2).forEach((d, i) => {
    fb.add(`wd${i}`, `Lowest-scoring district ${i + 1}`, d.district, d.district, "Composite score across covered districts");
    fb.add(`wd${i}a`, `${d.district} attendance`, d.agg.attendanceRate, pct(d.agg.attendanceRate), "Computed from survey rows");
  });
  g.evidence.forEach((e, i) => fb.add(`ev${i}`, `Evidence asset ${e.id}`, e.id, `${e.id} (${e.title}, ${e.district})`, `Evidence index (file 03), ${MONTH_LABEL[e.month]}`));
  return fb;
}

function deriveRisks(g: GrantFacts, fb: FactBook): GrantFacts["risks"] {
  const out: GrantFacts["risks"] = [];
  const ref = (k: string) => fb.idOf(k);
  let i = 0;
  const add = (level: "high" | "medium" | "low", text: string, refs: string[]) => out.push({ id: `R${++i}`, level, text, refs: refs.filter(Boolean) });
  g.assessment.indicators.filter((x) => x.status !== "On Track").forEach((x) => {
    const k = x.key === "participation" ? "completion" : x.key === "evidence" ? "evidence" : "attendance";
    add(severity(x.status) <= 1 ? "high" : "medium", `${x.label} is ${x.status} at ${pct(x.value)}.`, [ref(k)]);
  });
  if (g.finance.flag !== "On pace") add(g.finance.flag === "Behind pace" ? "high" : "medium", `Spend is ${g.finance.flag.toLowerCase()}: ${pct(g.finance.utilization)} used against a ${pct(g.finance.expectedUtilization, 0)} plan.`, [ref("util"), ref("pace"), ref("paceFlag")]);
  g.milestones.forEach((m, k) => { if (m.status.toLowerCase() !== "completed") add(m.status.toLowerCase().includes("risk") ? "high" : "medium", `Milestone not complete: ${m.name} is ${m.status} (owner: ${m.owner}).`, [ref(`ms${k}`)]); });
  if (/revision/i.test(g.reportStatus)) add("medium", `Report status is "${g.reportStatus}".`, [ref("reportStatus")]);
  if (!g.evidence.some((e) => e.sameMonth)) add("low", "No evidence or media assets are linked to this reporting month.", [ref("month")]);
  return out;
}
export { classify };
