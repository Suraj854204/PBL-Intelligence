import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ActionItem, Month, Selection } from "../../shared/types.js";
import { dashboard, geoRows } from "./geography.js";
import { grantFacts, grantList, type GrantData } from "./grants.js";
import { pct } from "./risk.js";
import type { Store } from "./store.js";
import { MONTH_LABEL } from "./types.js";

const OWNER = { participation: "District Program Coordinator", evidence: "M&E Lead", attendance: "Block Resource Coordinator", finance: "Finance Lead", grant: "Program Manager", academic: "Academic Lead" } as const;
// Serverless filesystems are read-only except the OS temp dir (state there is per-instance and not durable: use a DB in production).
const STATE_FILE = process.env.VERCEL ? path.join(os.tmpdir(), "pbl-actions.json") : path.resolve(process.cwd(), "data", ".state", "actions.json");

function addDays(month: Month, days: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0)); // last day of month
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const DUE = { P1: 14, P2: 28, P3: 42 } as const;

function readState(): Record<string, ActionItem["status"]> {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch { return {}; }
}
export function saveStatus(id: string, status: ActionItem["status"]) {
  const s = readState(); s[id] = status;
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
  } catch (e) { console.error("Could not persist action status", e); }
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Deterministic action generator: every action is tied to a computed gap, with owner/priority/due date by rule. */
export function generateActions(store: Store, gd: GrantData, month: Month): ActionItem[] {
  const sel: Selection = { month, grades: [], subjects: [] };
  const out: ActionItem[] = [];
  const push = (a: Omit<ActionItem, "id" | "status" | "dueDate"> & { key: string }) => {
    const { key, ...rest } = a;
    out.push({ ...rest, id: `${month}-${slug(key)}`, status: "Open", dueDate: addDays(month, DUE[a.priority]) });
  };
  const ownerFor = (k: "participation" | "evidence" | "attendance") => OWNER[k];
  const verb = { participation: "Raise PBL participation", evidence: "Close evidence gaps", attendance: "Lift PBL attendance" } as const;

  const districts = geoRows(store, sel, "district").filter((g) => g.priority === "P1" || g.priority === "P2").sort((a, b) => b.studentsInGap - a.studentsInGap).slice(0, 3);
  for (const g of districts) {
    const k = g.assessment.primaryGap, ind = g.assessment.indicators.find((i) => i.key === k)!;
    push({ key: `district-${g.name}-${k}`, title: `${verb[k]} in ${g.name}`, priority: g.priority === "P1" ? "P1" : "P2", owner: ownerFor(k),
      detail: `${g.name} is ${g.assessment.status}; ${ind.label.toLowerCase()} is the weakest indicator. About ${g.studentsInGap.toLocaleString("en-IN")} students sit below the 75% target. Agree a visit plan for the lowest blocks.`,
      linkedMetric: { label: ind.label, value: pct(ind.value), target: "≥ 75%" }, scope: { district: g.name }, basis: "District priority (status severity, then students in gap)" });
  }
  const blocks = geoRows(store, sel, "block").filter((b) => !b.lowSample && ["At Risk", "Critical"].includes(b.assessment.status)).sort((a, b) => b.studentsInGap - a.studentsInGap).slice(0, 2);
  for (const b of blocks) {
    const k = b.assessment.primaryGap, ind = b.assessment.indicators.find((i) => i.key === k)!;
    push({ key: `block-${b.name}-${k}`, title: `Field visit: ${b.name}`, priority: "P1", owner: ownerFor(k),
      detail: `${b.name} is ${b.assessment.status}. ${ind.label} is ${pct(ind.value)}; review school-level responses and agree corrective steps with the block team.`,
      linkedMetric: { label: ind.label, value: pct(ind.value), target: "≥ 75%" }, scope: { district: b.district, block: b.name }, basis: "Block priority (largest student gap among At Risk/Critical blocks)" });
  }
  const d = dashboard(store, sel);
  const cell = [...d.gradeSubject].sort((a, b) => a.rate - b.rate)[0];
  if (cell && cell.rate < 0.75) push({ key: `cell-${cell.grade}-${cell.subject}`, title: `Review Class ${cell.grade} ${cell.subject} sessions`, priority: cell.rate < 0.6 ? "P1" : "P2", owner: OWNER.academic,
    detail: `Class ${cell.grade} ${cell.subject} has the lowest session attendance across all districts. Check timetabling and facilitator coverage for this class and subject.`,
    linkedMetric: { label: `Class ${cell.grade} ${cell.subject} attendance`, value: pct(cell.rate), target: "≥ 75%" }, scope: { grade: cell.grade, subject: cell.subject }, basis: "Lowest grade × subject attendance" });
  if (d.current.evidenceRate < 0.75) {
    const gapSchools = d.current.participating - d.current.withEvidence;
    push({ key: "evidence-gap", title: "Collect evidence from schools that ran PBL", priority: d.current.evidenceRate < 0.6 ? "P1" : "P2", owner: OWNER.evidence,
      detail: `${gapSchools.toLocaleString("en-IN")} schools ran a project but did not submit evidence. Send a reminder with the upload steps and follow up by call.`,
      linkedMetric: { label: "Evidence submission", value: pct(d.current.evidenceRate), target: "≥ 75%" }, scope: {}, basis: "Evidence submission below standard" });
  }
  for (const gl of grantList(gd)) {
    const f = grantFacts(store, gd, gl.grantId, month);
    if (!f) continue;
    if (f.finance.flag !== "On pace") push({ key: `finance-${gl.grantId}`, title: `Review budget pacing: ${f.name}`, priority: f.finance.flag === "Behind pace" ? "P2" : "P3", owner: OWNER.finance,
      detail: `${pct(f.finance.utilization)} of the budget is used against a ${pct(f.finance.expectedUtilization, 0)} plan. Confirm whether activities are delayed and agree a catch-up or reallocation plan with the donor.`,
      linkedMetric: { label: "Budget utilization", value: pct(f.finance.utilization), target: pct(f.finance.expectedUtilization, 0) }, scope: { grant: f.name }, basis: "Finance pacing variance" });
    if (/revision/i.test(f.reportStatus)) push({ key: `report-${gl.grantId}`, title: `Revise ${MONTH_LABEL[month].split(" ")[0]} report: ${f.name}`, priority: "P2", owner: OWNER.grant,
      detail: `The report is marked "${f.reportStatus}". Update the narrative using the latest computed facts and resubmit.`,
      linkedMetric: { label: "Report status", value: f.reportStatus, target: "Submitted" }, scope: { grant: f.name }, basis: "Report status" });
  }
  const rank = { P1: 0, P2: 1, P3: 2 } as const;
  const state = readState();
  return out.sort((a, b) => rank[a.priority] - rank[b.priority]).map((a) => ({ ...a, status: state[a.id] ?? a.status }));
}
