import { describe, expect, it } from "vitest";
import { Store } from "../server/engine/store";
import { dashboard, geoRows } from "../server/engine/geography";
import { grantFacts, loadGrantData } from "../server/engine/grants";
import { generateActions } from "../server/engine/actions";
import { grantNarrative } from "../server/narrative/grant";
import { programNarrative, reviewSummary } from "../server/narrative/program";
import type { Selection } from "../shared/types";

const store = new Store();
const gd = loadGrantData();
const MONTHS = ["2025-07", "2025-08", "2025-09"] as const;

// Every number in a JSON payload must be finite (NaN/Infinity silently become null in JSON and break UI maths).
function assertFinite(v: unknown, path = "$"): void {
  if (typeof v === "number") { if (!Number.isFinite(v)) throw new Error(`Non-finite number at ${path}`); return; }
  if (Array.isArray(v)) return v.forEach((x, i) => assertFinite(x, `${path}[${i}]`));
  if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) assertFinite(x, `${path}.${k}`);
}
const rateOk = (v: number) => v >= 0 && v <= 1.0000001;

const filters: Pick<Selection, "grades" | "subjects">[] = [
  { grades: [], subjects: [] }, { grades: [6], subjects: [] }, { grades: [7, 8], subjects: ["Math"] }, { grades: [8], subjects: ["Science"] }, { grades: [6, 7, 8], subjects: ["Science", "Math"] },
];

describe("stress: every district and block", () => {
  it("dashboard is finite and rates are within 0..1 for all 38 districts x 3 months x 5 filter sets", () => {
    for (const m of MONTHS) for (const d of [undefined, ...store.districts]) for (const f of filters) {
      const dash = dashboard(store, { month: m, district: d, ...f });
      assertFinite(dash, `${m}/${d}/${JSON.stringify(f)}`);
      for (const k of ["participationRate", "evidenceRate", "attendanceRate"] as const) expect(rateOk(dash.current[k]), `${k} ${m} ${d}`).toBe(true);
      expect(dash.current.participating).toBeLessThanOrEqual(dash.current.schools);
      expect(dash.current.withEvidence).toBeLessThanOrEqual(dash.current.participating);
    }
  });
  it("all 395 blocks resolve for every month with filters", () => {
    let n = 0;
    for (const [d, blocks] of Object.entries(store.blocksByDistrict)) for (const b of blocks) for (const m of MONTHS) {
      const dash = dashboard(store, { month: m, district: d, block: b, grades: [6], subjects: ["Math"] });
      assertFinite(dash, `${b}/${m}`); n++;
    }
    expect(n).toBe(395 * 3);
  });
  it("geography rows are finite, ranked uniquely and priority is consistent", () => {
    for (const m of MONTHS) for (const level of ["district", "block"] as const) for (const f of filters) {
      const rows = geoRows(store, { month: m, ...f }, level);
      assertFinite(rows);
      expect(new Set(rows.map((r) => r.rank)).size).toBe(rows.length);
      for (const r of rows) if (r.priority === "P1") expect(["At Risk", "Critical"]).toContain(r.assessment.status);
    }
  });
});

describe("stress: narratives stay grounded for every scope", () => {
  it("program narrative + review summary validate for all districts, selected blocks, all modes", async () => {
    const scopes: Selection[] = [];
    for (const m of MONTHS) {
      scopes.push({ month: m, grades: [], subjects: [] });
      for (const d of store.districts) scopes.push({ month: m, district: d, grades: [], subjects: [] });
    }
    for (const d of store.districts.slice(0, 6)) for (const b of store.blocksByDistrict[d].slice(0, 3)) scopes.push({ month: "2025-09", district: d, block: b, grades: [6], subjects: ["Math"] });
    let fallbacks = 0;
    for (const s of scopes) {
      for (const mode of ["off", "mock"] as const) {
        const n = await programNarrative(store, s, mode, null);
        expect(n.validation.ok, `${s.month} ${s.district} ${s.block} ${mode}: ${n.validation.unsupported}`).toBe(true);
        if (mode === "mock" && n.modeUsed === "deterministic") fallbacks++;
      }
      const r = reviewSummary(store, s);
      assertFinite(r);
      expect(r.markdown.length).toBeGreaterThan(50);
    }
    expect(fallbacks, "rule-based narrative should never need to fall back").toBe(0);
  });
  it("grant facts, narratives and actions work for every grant-month", async () => {
    for (const g of ["GRANT_AA_2025", "GRANT_BB_2025", "GRANT_CC_2025"]) for (const m of MONTHS) {
      const f = grantFacts(store, gd, g, m)!;
      assertFinite(f);
      for (const mode of ["off", "mock"] as const) { const n = await grantNarrative(f, mode, null); expect(n.validation.ok).toBe(true); expect(n.modeUsed).toBe(mode === "off" ? "deterministic" : "mock"); }
    }
    for (const m of MONTHS) { const a = generateActions(store, gd, m); assertFinite(a); expect(a.length).toBeGreaterThanOrEqual(3); expect(new Set(a.map((x) => x.id)).size).toBe(a.length); }
  });
  it("unknown grant/month returns null, not a crash", () => { expect(grantFacts(store, gd, "NOPE", "2025-09")).toBeNull(); });
});
