import type { Aggregate, Delta, Grade, Month, RiskStatus, Selection, Subject } from "../../shared/types.js";
import { classify } from "./risk.js";
import type { SchoolRecord } from "./types.js";
import { GRADES, MONTHS, SUBJECTS } from "./types.js";

export const gradesOf = (s: Pick<Selection, "grades">): Grade[] => (s.grades.length ? s.grades : GRADES);
export const subjectsOf = (s: Pick<Selection, "subjects">): Subject[] => (s.subjects.length ? s.subjects : SUBJECTS);

/** A school counts as participating in the selection if it ran PBL AND recorded attendance in a selected grade/subject cell. */
export function schoolCells(r: SchoolRecord, sel: Pick<Selection, "grades" | "subjects">) {
  const gs = gradesOf(sel), ss = subjectsOf(sel);
  let att = 0;
  for (const g of gs) for (const s of ss) att += r.att[g][s];
  const enrollment = gs.reduce((t, g) => t + r.enrollment[g], 0);
  return { att, enrollment, capacity: enrollment * ss.length, inSel: r.conducted && att > 0 };
}

export function schoolStatus(r: SchoolRecord, sel: Pick<Selection, "grades" | "subjects">): RiskStatus {
  const c = schoolCells(r, sel);
  return classify(c.capacity ? c.att / c.capacity : 0);
}

export function aggregate(rows: SchoolRecord[], sel: Pick<Selection, "grades" | "subjects">): Aggregate {
  let participating = 0, withEvidence = 0, enrollment = 0, attendance = 0, capacity = 0;
  for (const r of rows) {
    const c = schoolCells(r, sel);
    enrollment += c.enrollment; attendance += c.att; capacity += c.capacity;
    if (c.inSel) { participating++; if (r.evidence) withEvidence++; }
  }
  const schools = rows.length;
  const participationRate = schools ? participating / schools : 0;
  const evidenceRate = schools ? withEvidence / schools : 0;
  const attendanceRate = capacity ? attendance / capacity : 0;
  return {
    schools, participating, withEvidence, enrollment, attendance, capacity,
    participationRate, evidenceRate, evidenceOfParticipating: participating ? withEvidence / participating : 0,
    attendanceRate, composite: (participationRate + evidenceRate + attendanceRate) / 3,
  };
}

export function prevMonth(m: Month): Month | null {
  const i = MONTHS.indexOf(m);
  return i > 0 ? MONTHS[i - 1] : null;
}

export function delta(cur: Aggregate, prev: Aggregate | null): Delta {
  if (!prev) return { participationRate: null, evidenceRate: null, attendanceRate: null, composite: null, participating: null, attendance: null, withEvidence: null };
  return {
    participationRate: cur.participationRate - prev.participationRate,
    evidenceRate: cur.evidenceRate - prev.evidenceRate,
    attendanceRate: cur.attendanceRate - prev.attendanceRate,
    composite: cur.composite - prev.composite,
    participating: cur.participating - prev.participating,
    attendance: cur.attendance - prev.attendance,
    withEvidence: cur.withEvidence - prev.withEvidence,
  };
}

export function statusMix(rows: SchoolRecord[], sel: Pick<Selection, "grades" | "subjects">): Record<RiskStatus, number> {
  const mix: Record<RiskStatus, number> = { "On Track": 0, Behind: 0, "At Risk": 0, Critical: 0 };
  for (const r of rows) mix[schoolStatus(r, sel)]++;
  return mix;
}
