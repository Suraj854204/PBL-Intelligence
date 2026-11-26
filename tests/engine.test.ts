import { describe, expect, it } from "vitest";
import { classify, assess } from "../server/engine/risk";
import { Store } from "../server/engine/store";
import { aggregate, schoolStatus } from "../server/engine/metrics";
import { dashboard, geoRows } from "../server/engine/geography";
import { grantFacts, loadGrantData } from "../server/engine/grants";
import { validate, FactBook } from "../server/narrative/facts";
import { grantNarrative } from "../server/narrative/grant";
import { programNarrative, reviewSummary } from "../server/narrative/program";
import { llmNarrative } from "../server/narrative/llm";

const store = new Store();
const gd = loadGrantData();
const all = (month: any) => ({ month, grades: [], subjects: [] });

describe("risk thresholds", () => {
  it("classifies on the boundaries", () => {
    expect(classify(0.75)).toBe("On Track");
    expect(classify(0.7499)).toBe("Behind");
    expect(classify(0.6)).toBe("Behind");
    expect(classify(0.5999)).toBe("At Risk");
    expect(classify(0.35)).toBe("At Risk");
    expect(classify(0.3499)).toBe("Critical");
    expect(classify(0)).toBe("Critical");
  });
  it("uses weakest-link for overall status", () => {
    const a = aggregate(store.monthRows("2025-09"), { grades: [], subjects: [] });
    expect(assess(a).primaryGap).toBe("attendance");
    expect(assess({ ...a, participationRate: 0.2 }).status).toBe("Critical");
  });
});

describe("reconciliation with source files", () => {
  it("school status equals the file's derived risk on all 6,900 rows", () => {
    let bad = 0;
    for (const r of store.rows) if (schoolStatus(r, { grades: [], subjects: [] }) !== r.src.risk) bad++;
    expect(bad).toBe(0);
  });
  it("unfiltered totals match derived totals", () => {
    const a = aggregate(store.monthRows("2025-09"), { grades: [], subjects: [] });
    expect(a.enrollment).toBe(402142);
    expect(a.attendance).toBe(487336);
    expect(a.participating).toBe(2119);
  });
  it("grant performance recomputes from survey rows for all 9 grant-months", () => {
    for (const g of ["GRANT_AA_2025", "GRANT_BB_2025", "GRANT_CC_2025"]) for (const m of ["2025-07", "2025-08", "2025-09"]) {
      const f = grantFacts(store, gd, g, m as any)!;
      expect(f.reconciliation.every((r) => r.match), `${g} ${m}`).toBe(true);
    }
  });
});

describe("filters", () => {
  it("grade + subject filters change metrics consistently", () => {
    const rows = store.monthRows("2025-09");
    const g6s = aggregate(rows, { grades: [6], subjects: ["Science"] });
    let a = 0, e = 0;
    for (const r of rows) { a += r.att[6].Science; e += r.enrollment[6]; }
    expect(g6s.attendance).toBe(a);
    expect(g6s.attendanceRate).toBeCloseTo(a / e, 10);
    expect(g6s.participating).toBeLessThanOrEqual(aggregate(rows, { grades: [], subjects: [] }).participating);
  });
  it("district filter yields blocks and previous-month delta", () => {
    const d = dashboard(store, { ...all("2025-09"), district: "District A" });
    expect(d.geoLevel).toBe("block");
    expect(d.delta.attendanceRate).not.toBeNull();
    expect(dashboard(store, all("2025-07")).delta.attendanceRate).toBeNull();
  });
  it("geography priorities rank worst status first", () => {
    const rows = geoRows(store, all("2025-07"));
    const p1 = rows.filter((r) => r.priority === "P1");
    expect(p1.length).toBeLessThanOrEqual(5);
    expect(p1.every((r) => ["At Risk", "Critical"].includes(r.assessment.status))).toBe(true);
  });
});

describe("grounded narratives", () => {
  it("validator rejects invented numbers and unknown refs", () => {
    const fb = new FactBook();
    const f = fb.add("a", "A", 0.5, "50.0%", "x");
    expect(validate([{ heading: "h", segments: [{ kind: "fact", text: "Rate is 50.0%", refs: [f.id] }] }], fb.all).ok).toBe(true);
    const bad = validate([{ heading: "h", segments: [{ kind: "explanation", text: "Improved to 91.3%", refs: ["F9"] }] }], fb.all);
    expect(bad.ok).toBe(false);
    expect(bad.unsupported).toContain("91.3");
  });
  it("program + grant narratives pass grounding in every mode that needs no network", async () => {
    for (const m of ["off", "mock", "llm"] as const) {
      const n = await programNarrative(store, all("2025-09"), m, null);
      expect(n.validation.ok).toBe(true);
      expect(n.sections.length).toBeGreaterThan(0);
    }
    for (const gid of ["GRANT_AA_2025", "GRANT_BB_2025", "GRANT_CC_2025"]) for (const mo of ["2025-07", "2025-08", "2025-09"]) for (const m of ["off", "mock"] as const) {
      const n = await grantNarrative(grantFacts(store, gd, gid, mo as any)!, m, null);
      expect(n.validation.ok, `${gid} ${mo} ${m}: ${n.validation.unsupported}`).toBe(true);
    }
  });
  it("llm mode falls back when no key, and rejects hallucinated LLM output", async () => {
    const n = await programNarrative(store, all("2025-09"), "llm", null);
    expect(n.modeUsed).toBe("mock");
    expect(n.fallbackReason).toMatch(/ANTHROPIC_API_KEY/);
    const facts = new FactBook(); facts.add("a", "A", 1, "10", "s");
    const hallucinating = async () => JSON.stringify({ sections: [{ heading: "x", segments: [{ kind: "fact", text: "Attendance hit 99.9%", refs: ["F1"] }] }] });
    const r = await llmNarrative(hallucinating, facts.all, [], []);
    expect(r.sections).toBeUndefined();
    expect(r.error).toMatch(/grounding/);
    const n2 = await programNarrative(store, all("2025-09"), "llm", async () => "not json");
    expect(n2.modeUsed).toBe("mock");
  });
  it("review summary has all five sections' content", () => {
    const s = reviewSummary(store, all("2025-09"));
    expect(s.achievements.length && s.changes.length && s.risks.length && s.priorities.length && s.discussion.length).toBeTruthy();
    expect(s.markdown).toContain("Source facts");
  });
});
