import type { Grade, Month, Selection, Subject } from "../../shared/types.js";
import { loadPrimary } from "./loader.js";
import type { SchoolRecord } from "./types.js";
import { GRADES, MONTHS, SUBJECTS } from "./types.js";

/** In-memory repository. Swap for a Postgres-backed implementation with the same methods (see db/schema.sql). */
export class Store {
  rows: SchoolRecord[];
  private byMonth = new Map<Month, SchoolRecord[]>();
  readonly districts: string[];
  readonly blocksByDistrict: Record<string, string[]>;

  constructor(rows: SchoolRecord[] = loadPrimary()) {
    this.rows = rows;
    for (const m of MONTHS) this.byMonth.set(m, rows.filter((r) => r.month === m));
    const d = new Map<string, Set<string>>();
    for (const r of rows) (d.get(r.district) ?? d.set(r.district, new Set()).get(r.district)!).add(r.block);
    const len = (s: string) => [s.length, s] as const;
    this.districts = [...d.keys()].sort((a, b) => len(a)[0] - len(b)[0] || a.localeCompare(b));
    this.blocksByDistrict = Object.fromEntries(this.districts.map((k) => [k, [...d.get(k)!].sort()]));
  }

  monthRows(m: Month) { return this.byMonth.get(m) ?? []; }

  scope(sel: Pick<Selection, "month" | "district" | "block">, month: Month = sel.month): SchoolRecord[] {
    return this.monthRows(month).filter((r) => (!sel.district || r.district === sel.district) && (!sel.block || r.block === sel.block));
  }
}

export function parseSelection(q: Record<string, unknown>): Selection {
  const s = (k: string) => (typeof q[k] === "string" && q[k] ? (q[k] as string) : undefined);
  const month = (MONTHS as string[]).includes(s("month") ?? "") ? (s("month") as Month) : MONTHS[MONTHS.length - 1];
  const list = (k: string) => (s(k) ?? "").split(",").filter(Boolean);
  const grades = list("grades").map(Number).filter((g): g is Grade => (GRADES as number[]).includes(g));
  const subjects = list("subjects").filter((x): x is Subject => (SUBJECTS as string[]).includes(x));
  return { month, district: s("district"), block: s("block"), grades, subjects };
}
