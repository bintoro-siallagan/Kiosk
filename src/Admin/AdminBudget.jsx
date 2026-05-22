// src/Admin/AdminBudget.jsx
// Budget Management — set budget per kategori beban, lacak realisasi
// (budget vs actual).

import { useState, useEffect, useCallback } from "react";
import ReportActions from "./ReportActions.jsx";

const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const ST = {
  over: { c: "#ef4444", t: "OVER BUDGET" },
  warning: { c: "#f59e0b", t: "HAMPIR LIMIT" },
  ok: { c: "#10b981", t: "AMAN" },
};

export default function AdminBudget({ apiBase = "" }) {
  const [d, setD] = useState(null);
  const [cat, setCat] = useState("");
  const [amt, setAmt] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    fetch(`${apiBase}/api/budget`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const save = () => {
    if (!cat || !(Number(amt) > 0)) { setMsg("⚠ Kategori & jumlah wajib diisi"); return; }
    fetch(`${apiBase}/api/budget`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category_id: cat, amount: Number(amt) }),
    }).then(r => r.json()).then(j => {
      if (j.ok) { setMsg("✓ Budget di-set"); setCat(""); setAmt(""); load(); } else setMsg(j.error || "gagal");
    }).catch(e => setMsg(String(e)));
  };
  const del = (id) => {
    if (!window.confirm("Hapus budget kategori ini?")) return;
    fetch(`${apiBase}/api/budget/${id}`, { method: "DELETE" }).then(() => load());
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Budget…</div>;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        🎯 <b style={{ color: "#a78bfa" }}>BUDGET MANAGEMENT</b> — set budget per kategori beban,
        sistem lacak realisasi otomatis dari pengeluaran. Periode <b>{d.period}</b>.
      </div>

      <ReportActions title={`Budget ${d.period}`} subtitle="Budget vs realisasi per kategori"
        columns={["Kategori", "Budget", "Realisasi", "Sisa", "%", "Status"]}
        rows={d.budgets.map(b => [b.category_name, b.amount, b.actual, b.remaining, b.pct + "%", b.status])} />

      <div style={S.kpiRow}>
        <Kpi label="Total Budget" v={fmtRp(s.total_budget)} c="#a78bfa" />
        <Kpi label="Realisasi" v={fmtRp(s.total_actual)} c="#3b82f6" />
        <Kpi label="Sisa Budget" v={fmtRp(s.total_remaining)} c={s.total_remaining >= 0 ? "#10b981" : "#ef4444"} />
        <Kpi label="Over Budget" v={String(s.over_count)} c={s.over_count > 0 ? "#ef4444" : "#10b981"} sub="kategori" />
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>➕ SET BUDGET KATEGORI</div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <select value={cat} onChange={e => setCat(e.target.value)} style={{ ...S.input, flex: 2 }}>
            <option value="">— Pilih kategori beban —</option>
            {d.categories.map(c => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
          </select>
          <input value={amt} onChange={e => setAmt(e.target.value)} placeholder="Budget (Rp)" type="number" style={{ ...S.input, flex: 1 }} />
          <button onClick={save} style={S.btnPrimary}>Set Budget</button>
        </div>
        {msg ? <div style={{ fontSize: 12, marginTop: 8, color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>📊 BUDGET vs REALISASI — {d.budgets.length} KATEGORI</div>
        {d.budgets.length === 0 ? (
          <div style={{ color: "#5b6470", fontSize: 13, padding: "12px 0" }}>Belum ada budget — set di atas.</div>
        ) : d.budgets.map(b => {
          const st = ST[b.status] || ST.ok;
          return (
            <div key={b.id} style={{ padding: "11px 0", borderTop: "1px solid #161b22" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#e6edf3" }}>{b.category_name}</span>
                <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: st.c, fontWeight: 700 }}>{st.t}</span>
                  <button onClick={() => del(b.id)} style={S.x}>×</button>
                </span>
              </div>
              <div style={{ height: 14, background: "#0a0e16", borderRadius: 7, overflow: "hidden" }}>
                <div style={{ height: "100%", width: Math.min(100, b.pct) + "%", background: st.c }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 12, fontFamily: "'Geist Mono',monospace" }}>
                <span style={{ color: "#9da7b3" }}>Realisasi {fmtRp(b.actual)} <span style={{ color: st.c }}>({b.pct}%)</span></span>
                <span style={{ color: "#5b6470" }}>Budget {fmtRp(b.amount)} · sisa <b style={{ color: b.remaining >= 0 ? "#10b981" : "#ef4444" }}>{fmtRp(b.remaining)}</b></span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Kpi({ label, v, c, sub }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Geist Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: c, fontFamily: "'Geist Mono',monospace", margin: "4px 0 2px" }}>{v}</div>
      <div style={{ fontSize: 10, color: "#5b6470" }}>{sub || " "}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Geist Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  input: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 7, padding: "8px 10px", color: "#e6edf3", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" },
  btnPrimary: { background: "#a78bfa", color: "#140a2e", border: "none", borderRadius: 7, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
  x: { background: "transparent", border: "none", color: "#5b6470", fontSize: 16, cursor: "pointer", lineHeight: 1 },
};
