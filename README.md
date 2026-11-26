# PBL Program Intelligence & Grant Reporting Assistant

## Quick start (Windows, Mac, Linux)

Unzip so that `package.json` sits directly inside your project folder, then in a terminal opened in that folder:

```bash
npm install
npm run dev        # open http://localhost:5173
```

## Deploy to Vercel (3 steps)

1. Push this folder to a GitHub repository (the folder that contains `package.json` must be the repo root).
2. In Vercel choose **Add New, Project**, import the repository, leave **Root Directory empty** and every setting on its default. No environment variables are needed.
3. Click **Deploy**, then open `https://<your-site>.vercel.app/api/health`. It should show `{"ok":true,"schools":2300}`.

How it works: `vercel.json` serves the Vite build as static files and routes `/api/*` to one serverless function, `api/index.js`, which is a bundled copy of the Express app (`npm run build` regenerates it; the committed copy is used as a fallback). Evidence images are served statically from `public/evidence`. Action status is also remembered in the browser, because serverless instances do not share memory; use a database for durable status in production.


A working end-to-end app for the Mantra4Change Lead Full-Stack Product Developer assignment.
It turns three months of PBL school responses into review-ready decisions and grant-ready report text.
**All data is synthetic.** Deterministic metrics, risk bands, priorities, actions and grant fact summaries work with AI fully disabled.

## Run it

Requires Node 20+ (tested on 22).

Unzip, then open a terminal **inside the `app` folder** (the one containing `package.json`).

```bash
npm install
npm run dev            # API on :4000, UI on http://localhost:5173
# or, single process:
npm run build && npm start   # http://localhost:4000
npm test               # 18 tests: engine, reconciliation, stress over every district and block
npm run verify         # typecheck + tests
```

Optional: copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY` to turn on the LLM narrative mode. Not required for anything.

## What is built

| Tier | Feature | Where |
|---|---|---|
| 1 | Filters: month, district, block, class, subject. Every metric reacts. State lives in the URL (shareable). | filter bar, `server/engine/store.ts` |
| 1 | Monthly dashboard: schools, participating, participation %, evidence %, enrollment, attendance, attendance %, month-over-month on all of them, trend, school status mix, class × subject heat grid. | Overview |
| 1 | District and block performance: sortable, searchable table, top and bottom lists, “why this status” drawer, CSV export. | Districts & blocks |
| 1 | Deterministic risk and gap engine: 75 / 60 / 35 bands per indicator, weakest-link status, explanations, priority P1–P3. | `server/engine/risk.ts`, `geography.ts` |
| 1 | Grant reporting assistant: grant + month → finance utilization and pacing, outcomes, milestones, rule-derived risks, linked evidence images, district drivers, reconciliation, report preview with traceable facts. | Grant reports |
| 2 | Monthly review summary: achievements, MoM changes, risks, priority districts/blocks, discussion points. | Review prep |
| 2 | Program reporting assistant: narrative for any month / district / block, with the facts used. | Review prep → Reporting narrative |
| 2 | Export: copy, Markdown download, print/PDF for summaries and grant sections; CSV for tables. | all report views |
| 3 | Recommended actions with owner, priority, due date, status, linked metric. Status edits persist on the server. | Actions |

## Architecture

```
CSV (data/) ─► loader ─► Store (in-memory repo) ─► engine (metrics, risk, geography, grants, actions)
                                                      │
                                       FactBook (numbered facts F1…Fn)
                                                      │
                     ┌────────────────────────────────┼────────────────────────┐
                 AI off: list facts        Rule-based: template prose      LLM (optional)
                     └──────────── grounding validator (every number must be a registered fact) ───┘
                                                      │ fail → fall back to deterministic facts
                              Express JSON API ─► React + Vite UI (shared/types.ts)
```

- `server/engine/*` is pure and testable; nothing in it imports AI code.
- `shared/types.ts` is the contract between API and UI.
- The `Store` class is the only data-access seam. `db/schema.sql` is the PostgreSQL model to swap in.

## Data model

Survey grain: one row per school per month (2,300 schools × 3 months = 6,900 rows; 38 districts, 395 blocks).
Normalized into `SchoolRecord` (`server/engine/types.ts`): enrollment per grade, attendance per grade × subject, conducted/evidence flags, declared classes/subjects, plus the file’s derived fields kept only for reconciliation. Grant files load as finance rows, performance rows and an evidence index. Postgres DDL: `db/schema.sql`.

## Calculations (and assumptions)

- **Participation** = schools that ran PBL ÷ all schools in scope. **Evidence** = schools with evidence ÷ all schools in scope (same denominator the grant file uses, so they reconcile exactly).
- **Attendance** = Σ session attendance ÷ (enrollment × 2 sessions). The raw ratio exceeds 100% because each school reports two sessions per class; the source files’ own attendance rate divides by 2 × enrollment, so the app uses that definition. Schools that did not run PBL count as zero, as in the source.
- **Class / subject filters** use the *recorded* attendance cells. A school counts as participating in a selection only if it ran PBL and recorded attendance there. Attendance rate for a selection = Σ selected cells ÷ (selected enrollment × number of selected subjects).
- **MoM** = percentage-point change vs the previous month under the same filters; July has none.
- **Composite** = mean of three rates, used only for ranking. **Students in gap** = enrollment × max(0, 75% − composite), used to order follow-up.
- **Small samples**: geographies with fewer than 5 schools are flagged and excluded from “strongest” lists.
- **Finance pace**: linear 3-month plan (33% / 67% / 100%). Variance ≥ −5 pts on pace, ≥ −15 slightly behind, else behind. Units are the file’s synthetic budget units.

## Risk logic

Bands: On Track ≥ 75%, Behind 60 to < 75%, At Risk 35 to < 60%, Critical < 35% (`classify`, rounded to 4 dp so 75.0% never flips on float noise).
Each indicator (participation, evidence, attendance) is banded. A geography, grant or whole scope takes the **status of its weakest indicator**, so one strong number cannot hide a weak one. Every status ships with generated reasons: which indicator, which band, how many points to the next band and to On Track.
Priority: worst status first, then most students in the gap; top five At Risk/Critical are P1, the rest of that group P2, Behind is P3.
Schools are banded on their own attendance; this reproduces the file’s “Derived: Risk status” on all 6,900 rows (tested).

## AI workflow

Deterministic calculations → structured insights → numbered facts → wording → validation.
- **AI off**: bullet list of facts, each with its F-number.
- **Rule-based (mock AI)**: fluent paragraphs from templates. Segments are tagged *fact* (restates a computed value) or *explanation* (interpretation, no numbers). The UI styles them differently and shows the source on hover.
- **LLM (optional)**: same facts are sent as JSON; the model returns JSON sections. Output is rejected unless every number matches a registered fact and every reference exists.
- On any failure (no key, timeout, bad JSON, unsupported number) the app falls back and says so on screen. The LLM path was unit-tested with stub clients; it has not been exercised against the live API in this build.

## Grant report guardrails

Only evidence rows in the index for the selected grant (and earlier months) are shown or cited, using their own district labels. Assets are labelled synthetic. Performance numbers are recomputed from survey rows and reconciled against the grant file (all 9 grant-months match); the file’s draft text is shown for comparison only.

## Data findings worth knowing

- Attendance exceeds enrollment if read naively (see above).
- Enrollment is identical across all three months.
- Attendance is recorded for grades/subjects a school did not tick in “which classes/subject”. 545–1,468 school-months per grade. Filters trust recorded attendance; the Data & method page lists the counts.
- Grant status in the file is attendance-based; this app shows the weakest-of-three, which agrees in every current grant-month.
- Finance notes say “Within plan” while September spend is ~80% at period end; the pace check flags it.

## Limitations

In-memory store (fine for 6,900 rows; not for millions). No authentication. Action status is stored in a JSON file (`data/.state/`), not a database. Grant “days overdue” is not computed because dates are synthetic. No DOCX/PDF generation beyond browser print.

## Production readiness and next steps

Move the store to PostgreSQL (`db/schema.sql`) with materialized monthly aggregates; add auth and role-scoped geography access (district officers see only their district); validate CSV uploads with a schema and quarantine bad rows; add audit logs for action edits and generated reports; cache LLM output keyed by fact-set hash; add Playwright end-to-end tests and CI; server-side DOCX/PDF export; configurable thresholds and spend plans per donor.

## Live-review cheat sheet

- Risk rules: `server/engine/risk.ts` (single `THRESHOLDS` constant).
- Metric calculation: `server/engine/metrics.ts` (`aggregate`).
- Narratives: `server/narrative/program.ts`, `grant.ts`; grounding: `facts.ts`.
- Prove AI-off works: set the generator to “AI off” on Review prep or Grant reports; or `npm test`.

