import { useEffect, useState } from "react";
import type { ActionItem } from "../../shared/types";
import { ErrorBox, Skeleton } from "../components/ui";
import { useApi } from "../lib";
import { useApp } from "../state";

const ST: ActionItem["status"][] = ["Open", "In progress", "Blocked", "Done"];
export default function Actions() {
  const { sel, toast } = useApp();
  const { data, error } = useApi<ActionItem[]>(`/api/actions?month=${sel.month}`, { fresh: true });
  const [items, setItems] = useState<ActionItem[]>([]);
  const [f, setF] = useState<ActionItem["status"] | "All">("All");
  // Statuses are also kept in this browser, so edits survive on serverless hosts where server memory is not shared.
  const local = (): Record<string, ActionItem["status"]> => { try { return JSON.parse(localStorage.getItem("action-status") ?? "{}"); } catch { return {}; } };
  useEffect(() => { if (data) { const o = local(); setItems(data.map((a) => ({ ...a, status: o[a.id] ?? a.status }))); } }, [data]);
  const set = async (a: ActionItem, status: ActionItem["status"]) => {
    const prev = items;
    setItems(items.map((x) => (x.id === a.id ? { ...x, status } : x)));
    try { localStorage.setItem("action-status", JSON.stringify({ ...local(), [a.id]: status })); } catch { /* storage blocked */ }
    try { const r = await fetch(`/api/actions/${a.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) }); if (!r.ok) throw new Error(); toast(`Marked “${status}”`); }
    catch { toast(`Marked “${status}” (saved in this browser only)`); void prev; }
  };
  if (error) return <div className="page"><ErrorBox msg={error} /></div>;
  const shown = items.filter((a) => f === "All" || a.status === f);
  return (
    <div className="page">
      <div className="page-head"><div><h1>Recommended actions</h1><p>Generated from the computed gaps for {sel.month}. Each action names its owner, due date and the metric it should move. Status changes are saved on the server.</p></div>
        <div className="seg" role="group" aria-label="Status filter">{(["All", ...ST] as const).map((s) => <button key={s} aria-pressed={f === s} onClick={() => setF(s)}>{s}{s !== "All" ? ` ${items.filter((a) => a.status === s).length}` : ` ${items.length}`}</button>)}</div></div>
      {!data ? <Skeleton h={300} /> : shown.length === 0 ? <div className="card empty"><b>No actions in this status</b>Choose another status above.</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{shown.map((a) => (
          <article className="card act" key={a.id} style={{ opacity: a.status === "Done" ? 0.65 : 1 }}>
            <span className={`pill ${a.priority.toLowerCase()}`} style={{ marginTop: 3 }}>{a.priority}</span>
            <div><h2 style={{ fontSize: 15 }}>{a.title}</h2><p className="ink2" style={{ margin: "4px 0 8px" }}>{a.detail}</p>
              <div className="chips"><span className="chip">Owner: {a.owner}</span><span className="chip">Due {a.dueDate}</span><span className="chip">{a.linkedMetric.label}: {a.linkedMetric.value} → {a.linkedMetric.target}</span>{a.scope.district && <span className="chip">{a.scope.block ?? a.scope.district}</span>}{a.scope.grade && <span className="chip">Class {a.scope.grade} {a.scope.subject}</span>}{a.scope.grant && <span className="chip">{a.scope.grant}</span>}</div>
              <p className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>Why: {a.basis}</p></div>
            <label><span className="sr">Status for {a.title}</span><select className="status-select" value={a.status} onChange={(e) => set(a, e.target.value as ActionItem["status"])}>{ST.map((s) => <option key={s}>{s}</option>)}</select></label>
          </article>))}</div>)}
    </div>
  );
}
