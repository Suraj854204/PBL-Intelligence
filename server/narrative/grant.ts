import type { GrantFactsWithRefs, GrantResponse, Narrative, NarrativeMode, NarrativeSection, Segment } from "../../shared/types.js";
import { MONTH_LABEL } from "../engine/types.js";
import { pct } from "../engine/risk.js";
import { FactBook, MODE_LABEL, toMarkdown, validate } from "./facts.js";
import { registerFacts } from "../engine/grants.js";
import { anthropicClient, llmNarrative, type LlmClient } from "./llm.js";

const seg = (kind: Segment["kind"], text: string, refs: string[] = []): Segment => ({ kind, text, refs });

function build(g: GrantFactsWithRefs, fb: FactBook, mode: "off" | "mock"): NarrativeSection[] {
  const id = (k: string) => fb.idOf(k);
  const d = (k: string) => fb.byKeyGet(k)?.display ?? "";
  const has = (k: string) => !!fb.byKeyGet(k);
  const sameMonthEv = g.evidence.filter((e) => e.sameMonth);
  const evIdx = (eid: string) => g.evidence.findIndex((e) => e.id === eid);
  const weakRisk = g.assessment.status !== "On Track";

  if (mode === "off") {
    const L = (text: string, ...keys: string[]) => seg("fact", `• ${text}`, keys.map(id).filter(Boolean));
    const sections: NarrativeSection[] = [
      { heading: "Performance", segments: [
        L(`PBL completion: ${d("completion")} (${d("completed")} of ${d("sampled")} schools)`, "completion", "completed", "sampled"),
        L(`Evidence submission: ${d("evidence")} (${d("withEvidence")} schools)`, "evidence", "withEvidence"),
        L(`Attendance: ${d("attendance")}`, "attendance"),
        L(`Risk status: ${d("status")}`, "status"),
        ...(has("dAttendance") ? [L(`Change vs previous month: completion ${d("dCompletion")}, evidence ${d("dEvidence")}, attendance ${d("dAttendance")}`, "dCompletion", "dEvidence", "dAttendance")] : []),
      ] },
      { heading: "Finance", segments: [
        L(`Utilized ${d("spentCum")} of ${d("budget")} units (${d("util")}); planned pace ${d("pace")}; ${d("paceFlag")}`, "spentCum", "budget", "util", "pace", "paceFlag"),
      ] },
      { heading: "Milestones and report", segments: [
        ...g.milestones.map((_, i) => L(d(`ms${i}`), `ms${i}`)),
        L(`Report status: ${d("reportStatus")}; due ${d("reportDue")}`, "reportStatus", "reportDue"),
      ] },
      { heading: "Risks", segments: g.risks.map((r) => seg("fact", `• ${r.text}`, r.refs)) },
      { heading: "Linked evidence", segments: sameMonthEv.length ? sameMonthEv.map((e) => L(d(`ev${evIdx(e.id)}`), `ev${evIdx(e.id)}`)) : [seg("fact", "• No evidence assets linked to this month.", [id("month")])] },
    ];
    return sections.filter((s) => s.segments.length);
  }

  const parts: NarrativeSection[] = [];
  parts.push({ heading: "Summary", segments: [
    seg("fact", `${d("grant")} (${d("donor")}) covers ${d("districts")}. In ${d("month")}, ${d("completed")} of ${d("sampled")} sampled schools completed a PBL project (${d("completion")}), ${d("evidence")} submitted evidence and attendance was ${d("attendance")}.`, ["grant", "donor", "districts", "month", "completed", "sampled", "completion", "evidence", "attendance"].map(id)),
    seg("fact", `The grant is classed ${d("status")}.`, [id("status")]),
    seg("explanation", weakRisk ? `The classification is driven by ${d("weak")}, which is ${d("weakGap")} short of the On Track standard.` : "All three indicators meet the On Track standard.", weakRisk ? [id("weak"), id("weakGap")] : []),
  ] });
  if (has("dAttendance")) parts.push({ heading: "Progress since the previous month", segments: [
    seg("fact", `Compared with the previous month, completion changed ${d("dCompletion")}, evidence submission ${d("dEvidence")} and attendance ${d("dAttendance")}.`, ["dCompletion", "dEvidence", "dAttendance"].map(id)),
    seg("explanation", g.prevPerformance && g.performance.attendanceRate > g.prevPerformance.attendanceRate ? "Attendance is moving in the right direction, though the gap to the standard remains." : "Attendance did not improve, so follow-up should start there.", []),
  ] });
  parts.push({ heading: "Financial utilization", segments: [
    seg("fact", `${d("spentCum")} of ${d("budget")} approved units have been utilized (${d("util")}), with ${d("spentMonth")} units spent this month. The planned pace at month end is ${d("pace")}, a variance of ${d("paceVar")}.`, ["spentCum", "budget", "util", "spentMonth", "pace", "paceVar"].map(id)),
    seg("fact", `Finance pacing: ${d("paceFlag")}.`, [id("paceFlag")]),
    ...(g.finance.flag !== "On pace" ? [seg("explanation", "Unspent budget should be reviewed with the finance lead to confirm whether activities are delayed or costs are lower than planned.", [])] : []),
  ] });
  parts.push({ heading: "Milestones and reporting status", segments: [
    ...g.milestones.map((_, i) => seg("fact", `${d(`ms${i}`)}.`, [id(`ms${i}`)])),
    seg("fact", `Report status: ${d("reportStatus")}; due date ${d("reportDue")}.`, [id("reportStatus"), id("reportDue")]),
  ] });
  if (g.districtBreakdown.length > 1 && has("wd0")) parts.push({ heading: "Where the gap sits", segments: [
    seg("fact", `${d("wd0")} (attendance ${d("wd0a")}) and ${d("wd1")} (attendance ${d("wd1a")}) have the lowest composite scores among the covered districts.`, ["wd0", "wd0a", "wd1", "wd1a"].map(id)),
    seg("explanation", "These districts are the first candidates for field mentoring in the next cycle.", []),
  ] });
  parts.push({ heading: "Evidence", segments: sameMonthEv.length
    ? [seg("fact", `Linked evidence for this month: ${sameMonthEv.map((e) => d(`ev${evIdx(e.id)}`)).join("; ")}.`, sameMonthEv.map((e) => id(`ev${evIdx(e.id)}`))),
       seg("explanation", "All linked images and clippings are synthetic assessment assets, not field records.", [])]
    : [seg("explanation", "No evidence or media assets are linked to this reporting month in the evidence index.", [])] });
  return parts;
}

export async function grantNarrative(g: GrantFactsWithRefs, mode: NarrativeMode, client: LlmClient | null = anthropicClient): Promise<Narrative> {
  const fb = registerFacts(g);
  const facts = fb.all;
  const det = build(g, fb, "off");
  let sections = mode === "off" ? det : build(g, fb, "mock");
  let used: Narrative["modeUsed"] = mode === "off" ? "deterministic" : "mock";
  let fallbackReason: string | undefined;
  if (mode === "llm") {
    if (!client) fallbackReason = "No ANTHROPIC_API_KEY configured; used the rule-based generator instead.";
    else {
      const r = await llmNarrative(client, facts, sections, []);
      if (r.sections) { sections = r.sections; used = "llm"; } else fallbackReason = `${r.error}. Used the rule-based generator instead.`;
    }
  }
  const v = validate(sections, facts);
  if (!v.ok && used !== "deterministic") { sections = det; used = "deterministic"; fallbackReason = `Grounding check failed (${v.unsupported.join(", ")}). Showing deterministic facts.`; }
  const title = `${g.name} — ${MONTH_LABEL[g.month]} report section`;
  return {
    modeRequested: mode, modeUsed: used, fallbackReason, sections, facts, validation: validate(sections, facts),
    markdown: toMarkdown(title, sections, facts, [`Generated by: ${MODE_LABEL[used]}. All data synthetic, for assessment use only.`]),
  };
}

export async function grantResponse(g: GrantFactsWithRefs, mode: NarrativeMode): Promise<GrantResponse> {
  return { facts: g, narrative: await grantNarrative(g, mode) };
}
