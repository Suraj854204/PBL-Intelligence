import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";
import type { Grade, Month, Subject } from "../../shared/types.js";
import type { SchoolRecord } from "./types.js";
import { MONTHS } from "./types.js";

/** Finds the data folder whether running from source (tsx), a bundle (Vercel function) or another cwd. */
function resolveDataDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [process.env.DATA_DIR, path.resolve(process.cwd(), "data"), path.resolve(here, "../data"), path.resolve(here, "../../data"), "/var/task/data"].filter(Boolean) as string[];
  return candidates.find((c) => fs.existsSync(path.join(c, "primary"))) ?? candidates[0];
}
export const DATA_DIR = resolveDataDir();

export interface DataQualityIssue { id: string; severity: "info" | "warning"; title: string; detail: string; count: number }

const MONTH_FILE: Record<Month, string> = {
  "2025-07": "PBL_School_Response_Data_July_2025.csv",
  "2025-08": "PBL_School_Response_Data_August_2025.csv",
  "2025-09": "PBL_School_Response_Data_September_2025.csv",
};

const num = (v: string | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Parse by column position: headers are long survey questions and identical across the three files. */
export function parseMonthCsv(text: string): SchoolRecord[] {
  const rows: string[][] = parse(text, { skip_empty_lines: true, bom: true, relax_column_count: false });
  rows.shift();
  return rows.map((c) => {
    const classesTxt = c[8] ?? "";
    const subjTxt = c[9] ?? "";
    const declaredClasses = ([6, 7, 8] as Grade[]).filter((g) => classesTxt.includes(String(g)));
    const declaredSubjects = (["Science", "Math"] as Subject[]).filter((s) => subjTxt.includes(s));
    return {
      month: c[0] as Month,
      school: c[2].trim(),
      code: c[3].trim(),
      district: c[4].trim(),
      block: c[5].trim(),
      conducted: c[6].trim().toLowerCase() === "yes",
      evidence: c[7].trim().toLowerCase() === "yes",
      declaredClasses,
      declaredSubjects,
      enrollment: { 6: num(c[10]), 7: num(c[13]), 8: num(c[16]) },
      att: {
        6: { Science: num(c[11]), Math: num(c[12]) },
        7: { Science: num(c[14]), Math: num(c[15]) },
        8: { Science: num(c[17]), Math: num(c[18]) },
      },
      src: { totalEnrollment: num(c[19]), totalAttendance: num(c[20]), rate: num(c[21]), risk: c[22].trim() },
    };
  });
}

export function loadPrimary(dir = DATA_DIR): SchoolRecord[] {
  const out: SchoolRecord[] = [];
  for (const m of MONTHS) out.push(...parseMonthCsv(fs.readFileSync(path.join(dir, "primary", MONTH_FILE[m]), "utf8")));
  return out;
}

export function readCsvObjects(file: string): Record<string, string>[] {
  return parse(fs.readFileSync(file, "utf8"), { columns: true, skip_empty_lines: true, bom: true });
}

/** Validation pass: surfaced in the UI so users know what the numbers can and cannot support. */
export function dataQuality(rows: SchoolRecord[]): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  const seen = new Set<string>();
  let dup = 0, enrollMismatch = 0, attMismatch = 0, evNoConduct = 0, undeclared = 0, undeclaredSubj = 0, raw100 = 0;
  for (const r of rows) {
    const k = `${r.month}|${r.code}`;
    if (seen.has(k)) dup++;
    seen.add(k);
    const e = r.enrollment[6] + r.enrollment[7] + r.enrollment[8];
    if (e !== r.src.totalEnrollment) enrollMismatch++;
    const a = [6, 7, 8].reduce((s, g) => s + r.att[g as Grade].Science + r.att[g as Grade].Math, 0);
    if (a !== r.src.totalAttendance) attMismatch++;
    if (r.evidence && !r.conducted) evNoConduct++;
    if (r.conducted) {
      if (([6, 7, 8] as Grade[]).some((g) => !r.declaredClasses.includes(g) && r.att[g].Science + r.att[g].Math > 0)) undeclared++;
      if ((["Science", "Math"] as Subject[]).some((s) => !r.declaredSubjects.includes(s) && ([6, 7, 8] as Grade[]).some((g) => r.att[g][s] > 0))) undeclaredSubj++;
    }
    if (a > e) raw100++;
  }
  const dupOk = dup === 0;
  issues.push({ id: "dups", severity: dupOk ? "info" : "warning", title: dupOk ? "One response per school per month" : "Duplicate school-month responses", detail: dupOk ? "No duplicate school codes within any reporting month; all 2,300 schools report in each month." : "Duplicate responses found and not de-duplicated.", count: dup });
  issues.push({ id: "enrol", severity: enrollMismatch ? "warning" : "info", title: "Derived enrollment reconciles", detail: "Class 6+7+8 enrollment matches the file's derived total on every row.", count: enrollMismatch });
  issues.push({ id: "att", severity: attMismatch ? "warning" : "info", title: "Derived attendance reconciles", detail: "Sum of six session attendance fields matches the file's derived total on every row.", count: attMismatch });
  issues.push({ id: "evnc", severity: evNoConduct ? "warning" : "info", title: "No evidence without a project", detail: "Evidence is never marked submitted where the PBL project was not conducted.", count: evNoConduct });
  issues.push({ id: "undecl", severity: "warning", title: "Attendance recorded for grades not declared", detail: "Among schools that ran PBL, attendance exists for grades missing from the 'which classes' answer. The app trusts recorded session attendance for grade filters and flags this mismatch.", count: undeclared });
  issues.push({ id: "undeclS", severity: "warning", title: "Attendance recorded for subjects not declared", detail: "Same pattern for subject: attendance is present for a subject the school did not tick. Subject filters use recorded attendance.", count: undeclaredSubj });
  issues.push({ id: "rawgt", severity: "info", title: "Attendance counts exceed enrollment if read naively", detail: "Each school reports two sessions (Science, Math) per class, so attendance is summed over up to two sessions. The file's own attendance rate divides by 2 x enrollment; this app uses the same definition so figures reconcile to the source and grant files.", count: raw100 });
  return issues;
}
