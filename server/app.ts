import express from "express";
import path from "node:path";
import type { Month, NarrativeMode } from "../shared/types.js";
import { generateActions, saveStatus } from "./engine/actions.js";
import { dashboard, geoRows } from "./engine/geography.js";
import { grantFacts, grantList, loadGrantData } from "./engine/grants.js";
import { dataQuality, DATA_DIR } from "./engine/loader.js";
import { THRESHOLDS } from "./engine/risk.js";
import { parseSelection, Store } from "./engine/store.js";
import { GRADES, MONTHS, MONTH_LABEL, SUBJECTS } from "./engine/types.js";
import { grantResponse } from "./narrative/grant.js";
import { programNarrative, reviewSummary } from "./narrative/program.js";
import { anthropicClient } from "./narrative/llm.js";

const store = new Store();
const gd = loadGrantData();
const quality = dataQuality(store.rows);
export const app = express();
app.use(express.json());

const mode = (v: unknown): NarrativeMode => (v === "mock" || v === "llm" ? v : "off");
const wrap = (fn: express.RequestHandler): express.RequestHandler => (req, res, next) => Promise.resolve(fn(req, res, next)).catch((e) => { console.error(e); res.status(500).json({ error: "Internal error", detail: String(e?.message ?? e) }); });

app.get("/api/health", (_q, r) => r.json({ ok: true, schools: store.rows.length / 3 }));

app.get("/api/meta", (_q, r) => r.json({
  months: MONTHS.map((m) => ({ value: m, label: MONTH_LABEL[m] })), districts: store.districts, blocksByDistrict: store.blocksByDistrict,
  grades: GRADES, subjects: SUBJECTS, thresholds: THRESHOLDS, grants: grantList(gd), quality,
  ai: { llmAvailable: !!anthropicClient }, totals: { schools: store.rows.length / MONTHS.length, rows: store.rows.length },
}));

app.get("/api/dashboard", (q, r) => r.json(dashboard(store, parseSelection(q.query))));

app.get("/api/geographies", (q, r) => {
  const sel = parseSelection(q.query);
  const level = q.query.level === "block" ? "block" : q.query.level === "district" ? "district" : undefined;
  r.json({ level: level ?? (sel.district ? "block" : "district"), rows: geoRows(store, sel, level) });
});

app.get("/api/review-summary", (q, r) => r.json(reviewSummary(store, parseSelection(q.query))));
app.get("/api/narrative", wrap(async (q, r) => r.json(await programNarrative(store, parseSelection(q.query), mode(q.query.mode)))));

app.get("/api/grants/:id/:month", wrap(async (q, r) => {
  const m = q.params.month as Month;
  if (!MONTHS.includes(m)) return void r.status(400).json({ error: "Unknown month" });
  const f = grantFacts(store, gd, q.params.id, m);
  if (!f) return void r.status(404).json({ error: "Grant not found" });
  r.json(await grantResponse(f, mode(q.query.mode)));
}));

app.get("/api/actions", (q, r) => {
  const m = (MONTHS as string[]).includes(String(q.query.month)) ? (q.query.month as Month) : MONTHS[MONTHS.length - 1];
  r.json(generateActions(store, gd, m));
});
app.patch("/api/actions/:id", (q, r) => {
  const s = q.body?.status;
  if (!["Open", "In progress", "Blocked", "Done"].includes(s)) return void r.status(400).json({ error: "Invalid status" });
  saveStatus(q.params.id, s);
  r.json({ id: q.params.id, status: s });
});

app.use("/evidence", express.static(path.join(DATA_DIR, "grants", "images"), { maxAge: "1d" }));

export const stats = { schools: store.rows.length / 3, months: MONTHS.length, llm: !!anthropicClient };
export default app;
