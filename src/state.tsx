import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import type { Grade, Month, Selection, Subject } from "../shared/types";
import { useApi, type Meta } from "./lib";

interface Ctx { meta: Meta; sel: Selection; setSel: (p: Partial<Selection>) => void; reset: () => void; toast: (m: string) => void }
const C = createContext<Ctx | null>(null);
export const useApp = () => useContext(C)!;

export function AppProvider({ children }: { children: ReactNode }) {
  const { data: meta, error } = useApi<Meta>("/api/meta");
  const [sp, setSp] = useSearchParams();
  const [msg, setMsg] = useState<string | null>(null);
  const sel: Selection = useMemo(() => ({
    month: (sp.get("month") as Month) || "2025-09",
    district: sp.get("district") || undefined, block: sp.get("block") || undefined,
    grades: (sp.get("grades") ?? "").split(",").filter(Boolean).map(Number) as Grade[],
    subjects: (sp.get("subjects") ?? "").split(",").filter(Boolean) as Subject[],
  }), [sp]);
  const setSel = useCallback((p: Partial<Selection>) => {
    const next = { ...sel, ...p };
    if ("district" in p && p.district !== sel.district) next.block = undefined;
    const n = new URLSearchParams(sp);
    const put = (k: string, v?: string) => (v ? n.set(k, v) : n.delete(k));
    put("month", next.month); put("district", next.district); put("block", next.block);
    put("grades", next.grades.join(",")); put("subjects", next.subjects.join(","));
    setSp(n, { replace: true });
  }, [sel, sp, setSp]);
  const reset = useCallback(() => { const n = new URLSearchParams(sp); ["district", "block", "grades", "subjects"].forEach((k) => n.delete(k)); setSp(n, { replace: true }); }, [sp, setSp]);
  const toast = useCallback((m: string) => { setMsg(m); setTimeout(() => setMsg(null), 2200); }, []);
  if (error) return <div className="page"><div className="err"><b>Cannot reach the API.</b> Start it with <code>npm run dev</code> (or <code>npm start</code> after <code>npm run build</code>). {error}</div></div>;
  if (!meta) return <div className="page"><div className="skel" style={{ height: 80 }} /><div className="skel" style={{ height: 320 }} /></div>;
  return <C.Provider value={{ meta, sel, setSel, reset, toast }}>{children}{msg && <div className="toast" role="status">{msg}</div>}</C.Provider>;
}
