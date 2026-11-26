import type { Aggregate, Assessment, IndicatorAssessment, IndicatorKey, RiskStatus } from "../../shared/types.js";

/** Risk thresholds from the assignment brief. Single source of truth for the whole app. */
export const THRESHOLDS = { onTrack: 0.75, behind: 0.6, atRisk: 0.35 } as const;
export const STATUS_ORDER: RiskStatus[] = ["Critical", "At Risk", "Behind", "On Track"]; // worst -> best
export const STATUSES = STATUS_ORDER;

export function classify(rate: number): RiskStatus {
  // Round to 4dp first so values that display as 75.0% classify consistently with the source files.
  const r = Math.round(rate * 10000) / 10000;
  if (r >= THRESHOLDS.onTrack) return "On Track";
  if (r >= THRESHOLDS.behind) return "Behind";
  if (r >= THRESHOLDS.atRisk) return "At Risk";
  return "Critical";
}

export const severity = (s: RiskStatus) => STATUS_ORDER.indexOf(s); // 0 = worst
export const worst = (a: RiskStatus, b: RiskStatus) => (severity(a) <= severity(b) ? a : b);

const NEXT: Record<RiskStatus, { status: RiskStatus; threshold: number } | null> = {
  Critical: { status: "At Risk", threshold: THRESHOLDS.atRisk },
  "At Risk": { status: "Behind", threshold: THRESHOLDS.behind },
  Behind: { status: "On Track", threshold: THRESHOLDS.onTrack },
  "On Track": null,
};

export const bandText = (s: RiskStatus) =>
  s === "On Track" ? "75% or above" : s === "Behind" ? "60% to under 75%" : s === "At Risk" ? "35% to under 60%" : "under 35%";

export const pct = (v: number, dp = 1) => `${(v * 100).toFixed(dp)}%`;
export const pts = (v: number, dp = 1) => `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(dp)} pts`;

const LABEL: Record<IndicatorKey, string> = { participation: "PBL participation", evidence: "Evidence submission", attendance: "Attendance" };

export function assess(a: Aggregate): Assessment {
  const vals: Record<IndicatorKey, number> = { participation: a.participationRate, evidence: a.evidenceRate, attendance: a.attendanceRate };
  const indicators: IndicatorAssessment[] = (Object.keys(vals) as IndicatorKey[]).map((key) => {
    const value = vals[key];
    const status = classify(value);
    const nx = NEXT[status];
    return {
      key, label: LABEL[key], value, status,
      gapToOnTrack: Math.max(0, (THRESHOLDS.onTrack - value) * 100),
      nextBand: nx ? { status: nx.status, threshold: nx.threshold, pointsNeeded: Math.max(0, (nx.threshold - value) * 100) } : null,
    };
  });
  // Weakest-link: overall status is the worst indicator status; ties broken by lowest value.
  const primary = [...indicators].sort((x, y) => severity(x.status) - severity(y.status) || x.value - y.value)[0];
  const reasons: string[] = [];
  reasons.push(
    `Overall status is ${primary.status} because ${primary.label.toLowerCase()} (${pct(primary.value)}) is the weakest indicator and falls in the ${primary.status} band (${bandText(primary.status)}).`,
  );
  if (primary.nextBand) {
    const nb = primary.nextBand;
    reasons.push(nb.status === "On Track"
      ? `It needs +${nb.pointsNeeded.toFixed(1)} pts to reach On Track (${pct(nb.threshold, 0)}).`
      : `It needs +${nb.pointsNeeded.toFixed(1)} pts to reach ${nb.status} (${pct(nb.threshold, 0)}) and +${primary.gapToOnTrack.toFixed(1)} pts to reach On Track.`);
  }
  for (const i of indicators) {
    if (i.key === primary.key) continue;
    reasons.push(`${i.label} is ${pct(i.value)} (${i.status}).`);
  }
  return { status: primary.status, primaryGap: primary.key, indicators, reasons };
}
