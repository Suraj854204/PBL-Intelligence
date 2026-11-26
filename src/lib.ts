import { useEffect, useState } from "react";
import type { Grade, Month, RiskStatus, Selection, Subject } from "../shared/types";

export const pct = (v: number | null | undefined, dp = 1) => (v == null ? "–" : `${(v * 100).toFixed(dp)}%`);
export const pts = (v: number | null | undefined, dp = 1) => (v == null ? "–" : `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(dp)} pts`);
export const num = (v: number | null | undefined) => (v == null ? "–" : v.toLocaleString("en-IN"));
export const snum = (v: number | null | undefined) => (v == null ? "–" : `${v >= 0 ? "+" : "−"}${Math.abs(v).toLocaleString("en-IN")}`);
export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
export const statusClass = (s: RiskStatus) => `st-${slug(s)}`;
export const statusBar = (s: RiskStatus) => ({ "On Track": "bar-ok", Behind: "bar-behind", "At Risk": "bar-risk", Critical: "bar-crit" })[s];
export const STATUSES: RiskStatus[] = ["On Track", "Behind", "At Risk", "Critical"];

export interface Meta {
  months: { value: Month; label: string }[]; districts: string[]; blocksByDistrict: Record<string, string[]>;
  grades: Grade[]; subjects: Subject[]; thresholds: { onTrack: number; behind: number; atRisk: number };
  grants: { grantId: string; donor: string; name: string; districts: string[]; months: Month[] }[];
  quality: { id: string; severity: "info" | "warning"; title: string; detail: string; count: number }[];
  ai: { llmAvailable: boolean }; totals: { schools: number; rows: number };
}

const cache = new Map<string, unknown>();
export function useApi<T>(url: string | null, opts: { fresh?: boolean } = {}) {
  const [state, set] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: (!opts.fresh && url && (cache.get(url) as T)) || null, error: null, loading: !!url });
  useEffect(() => {
    if (!url) return;
    const hit = opts.fresh ? undefined : (cache.get(url) as T | undefined);
    if (hit) { set({ data: hit, error: null, loading: false }); return; }
    const ac = new AbortController();
    set((s) => ({ ...s, loading: true, error: null }));
    fetch(url, { signal: ac.signal })
      .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `Request failed (${r.status})`); return r.json(); })
      .then((d) => { if (!opts.fresh) cache.set(url, d); set({ data: d, error: null, loading: false }); })
      .catch((e) => { if (e.name !== "AbortError") set({ data: null, error: e.message, loading: false }); });
    return () => ac.abort();
  }, [url, opts.fresh]);
  return state;
}

export const qs = (sel: Selection, extra: Record<string, string> = {}) => {
  const p = new URLSearchParams({ month: sel.month, ...extra });
  if (sel.district) p.set("district", sel.district);
  if (sel.block) p.set("block", sel.block);
  if (sel.grades.length) p.set("grades", sel.grades.join(","));
  if (sel.subjects.length) p.set("subjects", sel.subjects.join(","));
  return p.toString();
};

export function download(name: string, text: string, type = "text/markdown") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
export const scopeName = (s: Selection) => s.block ?? s.district ?? "All districts";
export const slugName = (s: Selection) => `${slug(scopeName(s))}-${s.month}`;
