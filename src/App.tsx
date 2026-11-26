import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import { BarChart3, BookOpenCheck, ClipboardCheck, FileText, ListChecks, MapPinned, Moon, Sun, FlaskConical, X } from "lucide-react";
import { useState } from "react";
import { useApp } from "./state";
import Overview from "./pages/Overview";
import Geographies from "./pages/Geographies";
import ReviewPrep from "./pages/ReviewPrep";
import Grants from "./pages/Grants";
import Actions from "./pages/Actions";
import Method from "./pages/Method";

function FilterBar() {
  const { meta, sel, setSel, reset } = useApp();
  const { pathname } = useLocation();
  const blocks = sel.district ? meta.blocksByDistrict[sel.district] ?? [] : [];
  const tog = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const active = !!(sel.district || sel.block || sel.grades.length || sel.subjects.length);
  const grantPage = pathname.startsWith("/grants");
  return (
    <div className="topbar no-print" role="search" aria-label="Program review filters">
      <div className="filters">
        <div className="fgroup"><span className="flabel">Month</span>
          <div className="seg" role="group" aria-label="Reporting month">{meta.months.map((m) => <button key={m.value} aria-pressed={sel.month === m.value} onClick={() => setSel({ month: m.value })}>{m.label.split(" ")[0]}</button>)}</div></div>
        {!grantPage && <>
          <div className="fgroup"><label className="flabel" htmlFor="f-d">District</label>
            <select id="f-d" className="select" value={sel.district ?? ""} onChange={(e) => setSel({ district: e.target.value || undefined })}><option value="">All districts</option>{meta.districts.map((d) => <option key={d}>{d}</option>)}</select></div>
          <div className="fgroup"><label className="flabel" htmlFor="f-b">Block</label>
            <select id="f-b" className="select" disabled={!sel.district} value={sel.block ?? ""} onChange={(e) => setSel({ block: e.target.value || undefined })}><option value="">{sel.district ? "All blocks" : "Pick a district"}</option>{blocks.map((b) => <option key={b} value={b}>{b.replace(`${sel.district} - `, "")}</option>)}</select></div>
          <div className="fgroup"><span className="flabel">Class</span>
            <div className="seg" role="group" aria-label="Class">{meta.grades.map((g) => <button key={g} aria-pressed={sel.grades.includes(g)} onClick={() => setSel({ grades: tog(sel.grades, g) })}>{g}</button>)}</div></div>
          <div className="fgroup"><span className="flabel">Subject</span>
            <div className="seg" role="group" aria-label="Subject">{meta.subjects.map((s) => <button key={s} aria-pressed={sel.subjects.includes(s)} onClick={() => setSel({ subjects: tog(sel.subjects, s) })}>{s}</button>)}</div></div>
          {active && <button className="btn ghost sm" onClick={reset}><X size={13} />Clear filters</button>}
        </>}
      </div>
    </div>
  );
}

const NAV = [
  { to: "/", label: "Overview", icon: BarChart3, end: true },
  { to: "/geographies", label: "Districts & blocks", icon: MapPinned },
  { to: "/review", label: "Review prep", icon: ClipboardCheck },
  { to: "/grants", label: "Grant reports", icon: FileText },
  { to: "/actions", label: "Actions", icon: ListChecks },
  { to: "/method", label: "Data & method", icon: BookOpenCheck },
];

export default function App() {
  const { pathname, search } = useLocation();
  const [theme, setTheme] = useState<string>(() => { try { return localStorage.getItem("theme") ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"); } catch { return "light"; } });
  const flip = () => { const t = theme === "dark" ? "light" : "dark"; setTheme(t); document.documentElement.dataset.theme = t; try { localStorage.setItem("theme", t); } catch { /* storage blocked */ } };
  return (
    <div className="shell">
      <nav className="rail no-print" aria-label="Main">
        <div className="brand"><div className="brand-mark"><BarChart3 size={18} /></div><div><b>PBL Program<br />Intelligence</b><span>Review & grant reporting</span></div></div>
        <div className="nav">{NAV.map((n) => <NavLink key={n.to} to={{ pathname: n.to, search }} end={n.end} className={({ isActive }) => (isActive ? "active" : "")}><n.icon size={17} /><span className="lbl">{n.label}</span></NavLink>)}</div>
        <div className="rail-foot">
          <div className="synthetic"><FlaskConical size={15} style={{ flex: "none", marginTop: 2 }} /><span>All data is synthetic, for assessment use only.</span></div>
          <button className="btn" onClick={flip} aria-label="Toggle dark mode">{theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}{theme === "dark" ? "Light mode" : "Dark mode"}</button>
        </div>
      </nav>
      <div className="main">
        <FilterBar />
        <main key={pathname} id="content">
          <Routes>
            <Route path="/" element={<Overview />} /><Route path="/geographies" element={<Geographies />} /><Route path="/review" element={<ReviewPrep />} />
            <Route path="/grants" element={<Grants />} /><Route path="/actions" element={<Actions />} /><Route path="/method" element={<Method />} />
            <Route path="*" element={<div className="page"><div className="empty"><b>Page not found</b>Use the navigation to pick a view.</div></div>} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
