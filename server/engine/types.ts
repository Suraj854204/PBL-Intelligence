import type { Grade, Month, Subject } from "../../shared/types.js";

export interface SchoolRecord {
  month: Month;
  school: string;
  code: string;
  district: string;
  block: string;
  conducted: boolean;
  evidence: boolean;
  declaredClasses: Grade[];
  declaredSubjects: Subject[];
  enrollment: Record<Grade, number>;
  /** recorded session attendance per grade x subject */
  att: Record<Grade, Record<Subject, number>>;
  src: { totalEnrollment: number; totalAttendance: number; rate: number; risk: string };
}
export const GRADES: Grade[] = [6, 7, 8];
export const SUBJECTS: Subject[] = ["Science", "Math"];
export const MONTHS: Month[] = ["2025-07", "2025-08", "2025-09"];
export const MONTH_LABEL: Record<Month, string> = { "2025-07": "July 2025", "2025-08": "August 2025", "2025-09": "September 2025" };
