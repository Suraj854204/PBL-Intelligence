import type { FactRef, Insight, Narrative, NarrativeMode, NarrativeSection, ReviewSummary, Segment, Selection } from "../../shared/types.js";
import { dashboard, geoRows } from "../engine/geography.js";
import { assess, bandText, pct, pts } from "../engine/risk.js";
import type { Store } from "../engine/store.js";
import { MONTH_LABEL } from "../engine/types.js";
import { prevMonth } from "../engine/metrics.js";
import { anthropicClient, llmNarrative, type LlmClient } from "./llm.js";
import { FactBook, MODE_LABEL, toMarkdown, validate } from "./facts.js";

export const scopeLabel = (s: Selection) => (s.block ? s.block : s.district ?? "All districts");
export const filterLabel = (s: Selection) => {
  const parts: string[] = [];
  if (s.grades.length) parts.push(`Class ${s.grades.join(", ")}`);
  if (s.subjects.length) parts.push(s.subjects.join(" + "));
  return parts.length ? parts.join(" · ") : "All classes and subjects";
};
const num = (n: number) => n.toLocaleString("en-IN");
const sgn = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toLocaleString("en-IN")}`;

interface Built {
  facts: FactBook;
  title: string;
  insights: { achievements: Insight[]; changes: Insight[]; risks: Insight[]; priorities: Insight[]; discussion: Insight[] };
  extraAllowed: string[];
  prevLabel: string | null;
}

/** Deterministic insight generation. No AI: facts in, structured insights out. */
export function buildInsights(store: Store, sel: Selection): Built {
  const d = dashboard(store, sel);
  const fb = new FactBook();
  const month = MONTH_LABEL[sel.month];
  const pm = prevMonth(sel.month);
  const prevLabel = pm ? MONTH_LABEL[pm].split(" ")[0] : null;
  const A = d.current, as = d.assessment, dl = d.delta;
  const src = `Computed from ${num(A.schools)} school responses, ${month}`;

  const fScope = fb.add("scope", "Reporting scope", scopeLabel(sel), scopeLabel(sel), "Selected filters");
  const fMonth = fb.add("month", "Reporting month", sel.month, month, "Selected filters");
  const fSchools = fb.add("schools", "Total schools", A.schools, num(A.schools), src);
  const fPart = fb.add("part", "PBL participation", A.participationRate, pct(A.participationRate), `${num(A.participating)} of ${num(A.schools)} schools ran PBL`);
  const fPartN = fb.add("partN", "Participating schools", A.participating, num(A.participating), src);
  const fEv = fb.add("ev", "Evidence submission", A.evidenceRate, pct(A.evidenceRate), `${num(A.withEvidence)} of ${num(A.schools)} schools submitted evidence`);
  const fAtt = fb.add("att", "Attendance rate", A.attendanceRate, pct(A.attendanceRate), `${num(A.attendance)} attended ÷ ${num(A.capacity)} expected seat-sessions`);
  const fEnr = fb.add("enr", "Total enrollment", A.enrollment, num(A.enrollment), src);
  const fStatus = fb.add("status", "Overall risk status", as.status, as.status, "Weakest of three indicators vs thresholds 75/60/35");
  const weakest = as.indicators.find((i) => i.key === as.primaryGap)!;
  const fWeak = fb.add("weak", "Weakest indicator", weakest.label, weakest.label.toLowerCase(), "Lowest of participation, evidence, attendance");
  const fGap = fb.add("gap", "Points to reach On Track (weakest indicator)", weakest.gapToOnTrack, `${weakest.gapToOnTrack.toFixed(1)} pts`, "75% minus weakest indicator");

  const ach: Insight[] = [], chg: Insight[] = [], rsk: Insight[] = [], pri: Insight[] = [], dis: Insight[] = [];
  let n = 0;
  const mk = (kind: Insight["kind"], severity: Insight["severity"], text: string, refs: string[]): Insight => ({ id: `${kind[0]}${++n}`, kind, severity, text, refs });

  // --- movement
  const mom: { key: string; label: string; v: number | null; fact: FactRef }[] = [
    { key: "participation", label: "Participation", v: dl.participationRate, fact: fPart },
    { key: "evidence", label: "Evidence submission", v: dl.evidenceRate, fact: fEv },
    { key: "attendance", label: "Attendance", v: dl.attendanceRate, fact: fAtt },
  ];
  if (prevLabel && d.previous) {
    for (const m of mom) {
      const fd = fb.add(`d_${m.key}`, `${m.label}: change vs ${prevLabel}`, m.v!, pts(m.v!), `${month} minus ${MONTH_LABEL[pm!]}`);
      const up = m.v! > 0.0005;
      const sev = up ? "positive" : m.v! < -0.0005 ? "warning" : "neutral";
      chg.push(mk("change", sev, `${m.label} ${up ? "rose" : m.v! < -0.0005 ? "fell" : "held steady"} to ${m.fact.display} (${fd.display} vs ${prevLabel}).`, [m.fact.id, fd.id]));
    }
    const dPart = fb.add("d_partN", `Participating schools: change vs ${prevLabel}`, dl.participating!, sgn(dl.participating!), "Count difference between months");
    chg.push(mk("change", dl.participating! >= 0 ? "positive" : "warning", `${sgn(dl.participating!)} schools ran PBL compared with ${prevLabel} (${fPartN.display} in ${month.split(" ")[0]}).`, [dPart.id, fPartN.id]));
    const prevAs = assess(d.previous).status;
    if (prevAs !== as.status) {
      const fp = fb.add("prevStatus", `Overall status in ${prevLabel}`, prevAs, prevAs, "Same rules applied to prior month");
      chg.push(mk("change", severityRank(as.status) > severityRank(prevAs) ? "positive" : "warning", `Overall status moved from ${fp.display} to ${fStatus.display}.`, [fp.id, fStatus.id]));
    }
    // best improvement -> achievement
    const best = [...mom].sort((a, b) => (b.v ?? 0) - (a.v ?? 0))[0];
    if ((best.v ?? 0) > 0.01) {
      const fd = fb.get(fb.all.find((f) => f.label === `${best.label}: change vs ${prevLabel}`)!.id)!;
      ach.push(mk("achievement", "positive", `Strongest gain: ${best.label.toLowerCase()} improved ${fd.display} to ${best.fact.display}.`, [fd.id, best.fact.id]));
    }
  } else {
    chg.push(mk("change", "neutral", `${month} is the first reporting month, so there is no earlier month to compare against.`, [fMonth.id]));
  }

  // --- achievements
  as.indicators.filter((i) => i.status === "On Track").forEach((i) => {
    const f = i.key === "participation" ? fPart : i.key === "evidence" ? fEv : fAtt;
    ach.push(mk("achievement", "positive", `${i.label} is On Track at ${f.display} (target 75% or above).`, [f.id]));
  });

  // --- geographies
  const geos = geoRows(store, sel);
  const lvl = sel.district ? "block" : "district";
  if (!sel.block && geos.length > 1) {
    const onTrack = geos.filter((g) => g.assessment.status === "On Track");
    const hi = geos.filter((g) => ["At Risk", "Critical"].includes(g.assessment.status));
    const fOn = fb.add("geoOn", `${lvl}s On Track`, onTrack.length, String(onTrack.length), `Of ${geos.length} ${lvl}s`);
    const fTot = fb.add("geoTot", `${lvl}s in scope`, geos.length, String(geos.length), "Selected filters");
    const fHi = fb.add("geoHi", `${lvl}s At Risk or Critical`, hi.length, String(hi.length), `Of ${geos.length} ${lvl}s`);
    if (onTrack.length) ach.push(mk("achievement", "positive", `${fOn.display} of ${fTot.display} ${lvl}s are On Track overall.`, [fOn.id, fTot.id]));
    const ranked = [...geos].filter((g) => !g.lowSample).sort((a, b) => b.agg.composite - a.agg.composite);
    if (ranked[0]) {
      const fn = fb.add("topName", `Top ${lvl}`, ranked[0].name, ranked[0].name, "Highest composite score (min 5 schools)");
      const fc = fb.add("topComp", `Top ${lvl} composite score`, ranked[0].agg.composite, pct(ranked[0].agg.composite), "Mean of three indicators");
      ach.push(mk("achievement", "positive", `${fn.display} leads on composite score at ${fc.display}.`, [fn.id, fc.id]));
    }
    rsk.push(mk("risk", hi.length ? "critical" : "neutral", `${fHi.display} of ${fTot.display} ${lvl}s are At Risk or Critical.`, [fHi.id, fTot.id]));

    const top = [...geos].filter((g) => g.priority === "P1" || g.priority === "P2").sort((a, b) => b.studentsInGap - a.studentsInGap || a.agg.composite - b.agg.composite).slice(0, 5);
    top.forEach((g, i) => {
      const fa = fb.add(`pg${i}n`, `Priority ${lvl} ${i + 1}`, g.name, g.name, "Status severity, then students in gap");
      const fs = fb.add(`pg${i}s`, `${g.name} status`, g.assessment.status, g.assessment.status, "Weakest-link rule");
      const fi = fb.add(`pg${i}i`, `${g.name} weakest indicator`, g.assessment.primaryGap, g.assessment.indicators.find((x) => x.key === g.assessment.primaryGap)!.label.toLowerCase(), "Lowest indicator");
      const fv = fb.add(`pg${i}v`, `${g.name} weakest value`, g.assessment.indicators.find((x) => x.key === g.assessment.primaryGap)!.value, pct(g.assessment.indicators.find((x) => x.key === g.assessment.primaryGap)!.value), "Computed");
      const fg = fb.add(`pg${i}g`, `${g.name} students in gap`, g.studentsInGap, num(g.studentsInGap), "Enrollment × shortfall of composite below 75%");
      pri.push(mk("priority", g.assessment.status === "Critical" ? "critical" : "warning", `${fa.display}: ${fs.display}. ${cap(fi.display)} is ${fv.display}; about ${fg.display} students sit in the gap to the 75% target${g.lowSample ? " (small sample, verify with the field team)" : ""}.`, [fa.id, fs.id, fi.id, fv.id, fg.id]));
    });
    if (lvl === "district") {
      const blocks = geoRows(store, { ...sel, district: undefined }, "block").filter((b) => !b.lowSample && ["At Risk", "Critical"].includes(b.assessment.status)).sort((a, b) => b.studentsInGap - a.studentsInGap).slice(0, 3);
      blocks.forEach((b, i) => {
        const fa = fb.add(`pb${i}n`, `Priority block ${i + 1}`, b.name, b.name, "Largest student gap among At Risk/Critical blocks (min 5 schools)");
        const fs = fb.add(`pb${i}s`, `${b.name} status`, b.assessment.status, b.assessment.status, "Weakest-link rule");
        const fg = fb.add(`pb${i}g`, `${b.name} students in gap`, b.studentsInGap, num(b.studentsInGap), "Enrollment × shortfall");
        pri.push(mk("priority", "warning", `${fa.display} is ${fs.display} with about ${fg.display} students in the gap.`, [fa.id, fs.id, fg.id]));
      });
    }
  }

  // --- indicator risks
  as.indicators.filter((i) => i.status !== "On Track").forEach((i) => {
    const f = i.key === "participation" ? fPart : i.key === "evidence" ? fEv : fAtt;
    rsk.push(mk("risk", i.status === "Critical" || i.status === "At Risk" ? "critical" : "warning", `${i.label} is ${i.status} at ${f.display} (band: ${bandText(i.status)}).`, [f.id]));
  });
  const cells = [...d.gradeSubject].sort((a, b) => a.rate - b.rate);
  if (cells.length && !sel.grades.length && !sel.subjects.length) {
    const c = cells[0], best = cells[cells.length - 1];
    const fc = fb.add("wcell", "Weakest grade × subject", `Class ${c.grade} ${c.subject}`, `Class ${c.grade} ${c.subject}`, "Attendance by grade and subject");
    const fr = fb.add("wcellr", "Weakest grade × subject attendance", c.rate, pct(c.rate), "Session attendance ÷ enrollment");
    const fb2 = fb.add("bcell", "Strongest grade × subject", `Class ${best.grade} ${best.subject}`, `Class ${best.grade} ${best.subject}`, "Attendance by grade and subject");
    const fbr = fb.add("bcellr", "Strongest grade × subject attendance", best.rate, pct(best.rate), "Session attendance ÷ enrollment");
    rsk.push(mk("risk", c.status === "Critical" || c.status === "At Risk" ? "critical" : "warning", `${fc.display} has the lowest attendance at ${fr.display}, against ${fbr.display} for ${fb2.display}.`, [fc.id, fr.id, fb2.id, fbr.id]));
  }
  const crit = d.schoolStatusMix.Critical;
  const fCrit = fb.add("critSchools", "Schools classed Critical", crit, num(crit), "School-level attendance status, includes schools that did not run PBL");
  const notRun = A.schools - A.participating;
  const fNot = fb.add("notRun", "Schools that did not run PBL", notRun, num(notRun), src);
  if (notRun > 0) rsk.push(mk("risk", "warning", `${fNot.display} schools did not run a PBL project; ${fCrit.display} schools are classed Critical.`, [fNot.id, fCrit.id]));

  // --- discussion prompts (templated from the same facts)
  dis.push(mk("discussion", "neutral", `${cap(fWeak.display)} is the binding constraint at ${pct(weakest.value)}. What is the plan to close ${fGap.display} before the next review?`, [fWeak.id, fGap.id]));
  if (pri[0]) dis.push(mk("discussion", "neutral", `${pri[0].refs[0] ? fb.get(pri[0].refs[0])!.display : "The top priority geography"} needs follow-up first. Who owns the visit, and what support do they need?`, [pri[0].refs[0]]));
  if (A.participating < A.schools) dis.push(mk("discussion", "neutral", `${fNot.display} schools did not run PBL. Are the reasons logistical, capacity, or data-entry related?`, [fNot.id]));
  if (d.previous) dis.push(mk("discussion", "neutral", `Evidence submission is ${fEv.display} while participation is ${fPart.display}. Which schools ran PBL but did not upload evidence, and what blocks them?`, [fEv.id, fPart.id]));
  dis.push(mk("discussion", "neutral", `Which of the flagged ${lvl}s should be reviewed again next month, and which can be released from the watchlist?`, []));

  const lowN = geos.filter((g) => g.lowSample).length;
  const extra: string[] = [];
  if (lowN) extra.push(`${lowN} ${lvl}(s) have fewer than 5 schools and are excluded from top-performer ranking.`);

  const title = `Monthly review: ${scopeLabel(sel)}, ${month}`;
  void fScope; void fSchools; void fEnr;
  return { facts: fb, title, insights: { achievements: ach, changes: chg, risks: rsk, priorities: pri, discussion: dis }, extraAllowed: extra, prevLabel };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const severityRank = (s: string) => ["Critical", "At Risk", "Behind", "On Track"].indexOf(s);

export function reviewSummary(store: Store, sel: Selection): ReviewSummary {
  const b = buildInsights(store, sel);
  const sections: NarrativeSection[] = ([
    { heading: "Achievements", segments: b.insights.achievements.map((i) => ({ kind: "fact" as const, text: `• ${i.text}`, refs: i.refs })) },
    { heading: "Month-over-month movement", segments: b.insights.changes.map((i) => ({ kind: "fact" as const, text: `• ${i.text}`, refs: i.refs })) },
    { heading: "Risks and gaps", segments: b.insights.risks.map((i) => ({ kind: "fact" as const, text: `• ${i.text}`, refs: i.refs })) },
    { heading: "Priority follow-up", segments: b.insights.priorities.map((i) => ({ kind: "fact" as const, text: `• ${i.text}`, refs: i.refs })) },
    { heading: "Discussion points", segments: b.insights.discussion.map((i) => ({ kind: "fact" as const, text: `• ${i.text}`, refs: i.refs })) },
  ] as NarrativeSection[]).filter((s) => s.segments.length);
  return { selection: sel, title: b.title, facts: b.facts.all, ...b.insights, markdown: toMarkdown(b.title, sections, b.facts.all, [`Filters: ${filterLabel(sel)}. Synthetic data for assessment use only.`]) };
}

// ---- narrative (Program Reporting Assistant)
const F = (fb: FactBook, key: string) => fb.all.find((f) => f.id === key)!;

function outlineFrom(b: Built, sel: Selection, mode: NarrativeMode): NarrativeSection[] {
  const fb = b.facts;
  const byLabel = (l: string) => fb.all.find((f) => f.label === l);
  const seg = (kind: Segment["kind"], text: string, refs: string[] = []): Segment => ({ kind, text, refs });
  const month = byLabel("Reporting month")!, scope = byLabel("Reporting scope")!;
  const part = byLabel("PBL participation")!, ev = byLabel("Evidence submission")!, att = byLabel("Attendance rate")!;
  const status = byLabel("Overall risk status")!, weak = byLabel("Weakest indicator")!, gap = byLabel("Points to reach On Track (weakest indicator)")!;
  const partN = byLabel("Participating schools")!, schools = byLabel("Total schools")!;
  void F;

  if (mode === "off") {
    const bullets = (ins: Insight[]) => ins.map((i) => seg("fact", `• ${i.text}`, i.refs));
    return [
      { heading: "Headline facts", segments: [
        seg("fact", `• Scope: ${scope.display}, ${month.display} (${filterLabel(sel)})`, [scope.id, month.id]),
        seg("fact", `• Participation: ${part.display} (${partN.display} of ${schools.display} schools)`, [part.id, partN.id, schools.id]),
        seg("fact", `• Evidence submission: ${ev.display}`, [ev.id]),
        seg("fact", `• Attendance: ${att.display}`, [att.id]),
        seg("fact", `• Overall status: ${status.display}`, [status.id]),
      ] },
      { heading: "Movement", segments: bullets(b.insights.changes) },
      { heading: "Risks", segments: bullets(b.insights.risks) },
      { heading: "Priorities", segments: bullets(b.insights.priorities) },
    ].filter((s) => s.segments.length);
  }

  // rule-based "mock AI": fluent prose assembled from facts; interpretation is conditional on computed values only.
  const mov = b.insights.changes;
  const moveFacts = mov.filter((m) => m.refs.length).slice(0, 3);
  const ext = b.extraAllowed.length ? b.extraAllowed.join(" ") : "";
  const statusLine = status.display === "On Track"
    ? "All three indicators meet the 75% standard, so the focus can shift to sustaining quality."
    : `The status is driven by ${weak.display}, which needs ${gap.display} more to reach the On Track standard.`;
  const sections: NarrativeSection[] = [
    { heading: "Summary", segments: [
      seg("fact", `In ${month.display}, ${scope.display} recorded ${part.display} PBL participation (${partN.display} of ${schools.display} schools), ${ev.display} evidence submission and ${att.display} attendance.`, [month.id, scope.id, part.id, partN.id, schools.id, ev.id, att.id]),
      seg("fact", `Overall status: ${status.display}.`, [status.id]),
      seg("explanation", statusLine, [weak.id, gap.id].filter(() => status.display !== "On Track")),
    ] },
  ];
  if (moveFacts.length) sections.push({ heading: "Movement since last month", segments: [
    ...moveFacts.map((m) => seg("fact", m.text, m.refs)),
    seg("explanation", mov.some((m) => m.severity === "warning") ? "Some indicators softened, so the review should confirm whether this is a one-month dip or a trend." : "Momentum is positive; the review can concentrate on the remaining gaps.", []),
  ] });
  const pr = b.insights.priorities.slice(0, 3);
  if (pr.length) sections.push({ heading: "Where follow-up is needed", segments: [
    ...pr.map((p) => seg("fact", p.text, p.refs)),
    seg("explanation", "These are ranked by status severity and then by the number of students below the target, so field time goes where it reaches the most learners.", []),
  ] });
  const rk = b.insights.risks.filter((r) => r.refs.length).slice(0, 3);
  if (rk.length) sections.push({ heading: "Risks to note", segments: rk.map((r) => seg("fact", r.text, r.refs)) });
  if (ext) sections.push({ heading: "Data caveats", segments: [seg("explanation", ext, [])] });
  return sections;
}

export async function programNarrative(store: Store, sel: Selection, mode: NarrativeMode, client: LlmClient | null = anthropicClient): Promise<Narrative> {
  const b = buildInsights(store, sel);
  const facts = b.facts.all;
  const det = outlineFrom(b, sel, "off");
  let sections = mode === "off" ? det : outlineFrom(b, sel, "mock");
  let used: Narrative["modeUsed"] = mode === "off" ? "deterministic" : "mock";
  let fallbackReason: string | undefined;
  if (mode === "llm") {
    if (!client) fallbackReason = "No ANTHROPIC_API_KEY configured; used the rule-based generator instead.";
    else {
      const r = await llmNarrative(client, facts, sections, b.extraAllowed);
      if (r.sections) { sections = r.sections; used = "llm"; } else fallbackReason = `${r.error}. Used the rule-based generator instead.`;
    }
  }
  const validation = validate(sections, facts, b.extraAllowed);
  if (!validation.ok && used !== "deterministic") { sections = det; used = "deterministic"; fallbackReason = `Grounding check failed (${validation.unsupported.join(", ")}). Showing deterministic facts.`; }
  const finalVal = validate(sections, facts, b.extraAllowed);
  return {
    modeRequested: mode, modeUsed: used, fallbackReason, sections, facts, validation: finalVal,
    markdown: toMarkdown(b.title, sections, facts, [`Generated by: ${MODE_LABEL[used]}. Filters: ${filterLabel(sel)}. Synthetic data for assessment use only.`]),
  };
}
