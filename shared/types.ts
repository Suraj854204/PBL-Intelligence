// Types shared by the API (server/) and the UI (src/). Pure data shapes, no logic.

export type Month = "2025-07" | "2025-08" | "2025-09";
export type Subject = "Science" | "Math";
export type Grade = 6 | 7 | 8;
export type RiskStatus = "On Track" | "Behind" | "At Risk" | "Critical";
export type IndicatorKey = "participation" | "evidence" | "attendance";

export interface Selection {
  month: Month;
  district?: string;
  block?: string;
  grades: Grade[]; // empty = all
  subjects: Subject[]; // empty = all
}

export interface Aggregate {
  schools: number;
  participating: number;
  withEvidence: number;
  enrollment: number;
  attendance: number; // summed session attendance
  capacity: number; // enrollment x number of session types in scope
  participationRate: number;
  evidenceRate: number; // of ALL schools in scope (dataset convention)
  evidenceOfParticipating: number;
  attendanceRate: number;
  composite: number; // mean of the three rates
}

export interface IndicatorAssessment {
  key: IndicatorKey;
  label: string;
  value: number;
  status: RiskStatus;
  gapToOnTrack: number; // points (0-100 scale) below 75%, 0 if met
  nextBand: { status: RiskStatus; threshold: number; pointsNeeded: number } | null;
}

export interface Assessment {
  status: RiskStatus; // weakest-link of the three indicators
  primaryGap: IndicatorKey;
  indicators: IndicatorAssessment[];
  reasons: string[];
}

export interface Delta {
  participationRate: number | null; // percentage points
  evidenceRate: number | null;
  attendanceRate: number | null;
  composite: number | null;
  participating: number | null; // absolute
  attendance: number | null; // absolute
  withEvidence: number | null;
}

export interface GeoRow {
  level: "district" | "block";
  name: string;
  district: string;
  agg: Aggregate;
  prev: Aggregate | null;
  delta: Delta;
  assessment: Assessment;
  studentsInGap: number;
  priority: "P1" | "P2" | "P3" | "None";
  rank: number; // 1 = best composite
  lowSample: boolean;
  statusMix: Record<RiskStatus, number>; // school-level status counts
  childAtRisk?: number; // blocks at At Risk/Critical (district rows)
  childCount?: number;
}

export interface GradeSubjectCell {
  grade: Grade;
  subject: Subject;
  attendance: number;
  capacity: number;
  rate: number;
  status: RiskStatus;
  prevRate: number | null;
}

export interface DashboardResponse {
  selection: Selection;
  current: Aggregate;
  previous: Aggregate | null;
  delta: Delta;
  assessment: Assessment;
  trend: { month: Month; label: string; agg: Aggregate }[];
  schoolStatusMix: Record<RiskStatus, number>;
  prevSchoolStatusMix: Record<RiskStatus, number> | null;
  top: GeoRow[];
  bottom: GeoRow[];
  geoLevel: "district" | "block";
  gradeSubject: GradeSubjectCell[];
  funnel: { label: string; value: number }[];
}

export interface FactRef { id: string; label: string; display: string; raw: number | string; source: string }

export interface Insight {
  id: string;
  kind: "achievement" | "change" | "risk" | "priority" | "discussion";
  severity: "positive" | "neutral" | "warning" | "critical";
  text: string;
  refs: string[]; // fact ids
}

export interface ReviewSummary {
  selection: Selection;
  title: string;
  facts: FactRef[];
  achievements: Insight[];
  changes: Insight[];
  risks: Insight[];
  priorities: Insight[];
  discussion: Insight[];
  markdown: string;
}

export interface Segment { kind: "fact" | "explanation" | "text"; text: string; refs: string[] }
export interface NarrativeSection { heading: string; segments: Segment[] }
export type NarrativeMode = "off" | "mock" | "llm";

export interface Narrative {
  modeRequested: NarrativeMode;
  modeUsed: NarrativeMode | "deterministic";
  fallbackReason?: string;
  sections: NarrativeSection[];
  facts: FactRef[];
  validation: { ok: boolean; checkedNumbers: number; unsupported: string[] };
  markdown: string;
}

export interface ActionItem {
  id: string;
  title: string;
  detail: string;
  priority: "P1" | "P2" | "P3";
  owner: string;
  dueDate: string;
  status: "Open" | "In progress" | "Blocked" | "Done";
  linkedMetric: { label: string; value: string; target: string };
  scope: { district?: string; block?: string; grade?: number; subject?: string; grant?: string };
  basis: string;
}

export interface BudgetLine {
  line: string; approved: number; monthly: number; cumulative: number; rate: number; expectedRate: number; variance: number; note: string;
}
export interface GrantFacts {
  grantId: string; donor: string; name: string; month: Month;
  periodStart: string; periodEnd: string; reportDue: string; reportStatus: string; districts: string[];
  performance: {
    sampled: number; completed: number; completionRate: number; withEvidence: number; evidenceRate: number;
    enrollment: number; attendance: number; attendanceRate: number; sourceRisk: RiskStatus;
  };
  assessment: Assessment;
  prevPerformance: { completionRate: number; evidenceRate: number; attendanceRate: number } | null;
  finance: { approved: number; monthly: number; cumulative: number; utilization: number; expectedUtilization: number; variance: number; lines: BudgetLine[]; flag: "On pace" | "Slightly behind pace" | "Behind pace" };
  milestones: { name: string; status: string; owner: string }[];
  risks: { id: string; level: "high" | "medium" | "low"; text: string; refs: string[] }[];
  evidence: { id: string; type: string; district: string; title: string; caption: string; url: string; usage: string; month: Month; sameMonth: boolean }[];
  districtBreakdown: { district: string; agg: Aggregate; status: RiskStatus }[];
  reconciliation: { metric: string; source: number; recomputed: number; match: boolean }[];
  sourceDraft: string;
}
export interface GrantResponse { facts: GrantFactsWithRefs; narrative: Narrative }
export interface GrantFactsWithRefs extends GrantFacts { factRefs: FactRef[] }
