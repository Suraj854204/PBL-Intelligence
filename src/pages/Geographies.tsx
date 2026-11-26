import { useMemo, useState } from "react";
import { ArrowDownAZ, Download, Search } from "lucide-react";
import type { GeoRow, RiskStatus } from "../../shared/types";
import { Delta, Empty, ErrorBox, GeoExplain, RiskRuler, Skeleton, StatusBadge } from "../components/ui";
import { download, num, pct, qs, scopeName, STATUSES, statusClass, useApi } from "../lib";
import { useApp } from "../state";

type SortKey = "rank" | "name" | "participation" | "evidence" | "attendance" | "gap" | "priority";
const PRI = { P1: 0, P2: 1, P3: 2, None: 3 } as const;

export default function Geographies() {
  const { sel, setSel } = useApp();
  const [level, setLevel] = useState<"district" | "block">(sel.district ? "block" : "district");
  const { data, error, loading } = useApi<{ level: "district" | "block"; rows: GeoRow[] }>(`/api/geographies?${qs(sel, { level })}`);
  const [q, setQ] = useState("");
  const [st, setSt] = useState<RiskStatus | "All">("All");
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: "priority", dir: 1 });
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<GeoRow | null>(null);
  const PAGE = 25;

  const rows = useMemo(() => {
    if (!data) return [];
    const f = data.rows.filter((r) => (st === "All" || r.assessment.status === st) && r.name.toLowerCase().includes(q.toLowerCase()));
    const val = (r: GeoRow): number | string => ({ rank: r.rank, name: r.name, participation: r.agg.participationRate, evidence: r.agg.evidenceRate, attendance: r.agg.attendanceRate, gap: r.studentsInGap, priority: PRI[r.priority] * 1e6 - r.studentsInGap })[sort.k];
    return [...f].sort((a, b) => { const x = val(a), y = val(b); return (typeof x === "string" ? x.localeCompare(y as string, undefined, { numeric: true }) : (x as number) - (y as number)) * sort.dir; });
  }, [data, q, st, sort]);

  if (error) return <div className="page"><ErrorBox msg={error} /></div>;
  const counts = Object.fromEntries(STATUSES.map((s) => [s, data?.rows.filter((r) => r.assessment.status === s).length ?? 0])) as Record<RiskStatus, number>;
  const shown = rows.slice(page * PAGE, page * PAGE + PAGE);
  const th = (k: SortKey, label: string, r = false) => <th className={r ? "r" : ""} aria-sort={sort.k === k ? (sort.dir === 1 ? "ascending" : "descending") : "none"}><button onClick={() => { setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : k === "name" || k === "priority" || k === "rank" ? 1 : -1 })); setPage(0); }}>{label}{sort.k === k && <ArrowDownAZ size={12} style={{ transform: sort.dir === 1 ? "none" : "scaleY(-1)" }} />}</button></th>;
  const exportCsv = () => {
    const head = ["Level", "Name", "District", "Status", "Priority", "Schools", "Participation %", "Evidence %", "Attendance %", "Composite %", "Students in gap"];
    const lines = rows.map((r) => [r.level, r.name, r.district, r.assessment.status, r.priority, r.agg.schools, (r.agg.participationRate * 100).toFixed(1), (r.agg.evidenceRate * 100).toFixed(1), (r.agg.attendanceRate * 100).toFixed(1), (r.agg.composite * 100).toFixed(1), r.studentsInGap].map((v) => `"${v}"`).join(","));
    download(`${level}-performance-${sel.month}.csv`, [head.join(","), ...lines].join("\n"), "text/csv");
  };
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>{level === "district" ? "District" : "Block"} performance</h1><p>{scopeName(sel)}. Sorted by follow-up priority: worst status first, then the number of students below the 75% target. Select a row to see why.</p></div>
        <div className="actions-row">
          <div className="seg" role="group" aria-label="Level">{(["district", "block"] as const).map((l) => <button key={l} aria-pressed={level === l} onClick={() => { setLevel(l); setPage(0); }}>{l === "district" ? "Districts" : "Blocks"}</button>)}</div>
          <button className="btn" onClick={exportCsv}><Download size={14} />Export CSV</button>
        </div>
      </div>
      <div className="card" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", padding: 12 }}>
        <label style={{ position: "relative" }}><span className="sr">Search</span><Search size={14} style={{ position: "absolute", left: 10, top: 10, color: "var(--ink-3)" }} /><input className="select" style={{ paddingLeft: 30, backgroundImage: "none", minWidth: 220 }} placeholder={`Search ${level}s`} value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} /></label>
        <div className="seg" role="group" aria-label="Status">
          <button aria-pressed={st === "All"} onClick={() => { setSt("All"); setPage(0); }}>All {data?.rows.length ?? ""}</button>
          {STATUSES.map((s) => <button key={s} aria-pressed={st === s} onClick={() => { setSt(s); setPage(0); }}>{s} {counts[s]}</button>)}
        </div>
        <span className="muted" style={{ fontSize: 12 }}>{loading ? "Updating…" : `${rows.length} shown`} · rows with under 5 schools are marked “small sample”.</span>
      </div>
      {!data ? <Skeleton h={420} /> : rows.length === 0 ? <div className="card"><Empty title={`No ${level}s match`}>Clear the search or status filter.</Empty></div> : (
        <div className="tbl-wrap card" style={{ padding: 0 }}>
          <table>
            <thead><tr>{th("rank", "Rank")}{th("name", level === "district" ? "District" : "Block")}<th>Status</th>{th("participation", "Participation", true)}{th("evidence", "Evidence", true)}{th("attendance", "Attendance", true)}<th title="Mean of the three rates; used for ranking only. Status uses the weakest indicator.">Composite (rank score)</th>{th("gap", "Students in gap", true)}{th("priority", "Priority")}</tr></thead>
            <tbody>{shown.map((r) => (
              <tr key={r.name} className="click" tabIndex={0} onClick={() => setOpen(r)} onKeyDown={(e) => e.key === "Enter" && setOpen(r)}>
                <td className="num muted">{r.rank}</td>
                <td className="name-cell">{r.name.replace(/^District \w+ - /, "")}<small>{r.level === "block" ? `${r.district} · ` : r.childCount ? `${r.childCount} blocks · ${r.childAtRisk} flagged · ` : ""}{num(r.agg.schools)} schools{r.lowSample ? " · small sample" : ""}</small></td>
                <td><StatusBadge s={r.assessment.status} /></td>
                <td className="r num">{pct(r.agg.participationRate)}<br /><Delta v={r.delta.participationRate} /></td>
                <td className="r num">{pct(r.agg.evidenceRate)}<br /><Delta v={r.delta.evidenceRate} /></td>
                <td className="r num"><b>{pct(r.agg.attendanceRate)}</b><br /><Delta v={r.delta.attendanceRate} /></td>
                <td style={{ minWidth: 130 }}><RiskRuler value={r.agg.composite} mini label={`Composite ${pct(r.agg.composite)}`} /><span className="muted num" style={{ fontSize: 11.5 }}>{pct(r.agg.composite)}</span></td>
                <td className="r num">{num(r.studentsInGap)}</td>
                <td>{r.priority !== "None" ? <span className={`pill ${r.priority.toLowerCase()}`}>{r.priority}</span> : <span className="muted">–</span>}</td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
      {rows.length > PAGE && <div className="actions-row" style={{ justifyContent: "space-between" }}><span className="muted">Page {page + 1} of {Math.ceil(rows.length / PAGE)}</span><span className="actions-row"><button className="btn" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><button className="btn" disabled={(page + 1) * PAGE >= rows.length} onClick={() => setPage(page + 1)}>Next</button></span></div>}
      {open && <GeoExplain g={open} onClose={() => setOpen(null)} onDrill={open.level === "district" ? () => { setSel({ district: open.name }); setLevel("block"); setOpen(null); } : undefined} />}
    </div>
  );
}
void statusClass;
