// src/Admin/AdminBudgetPlan.jsx
// Budget Planning — periode, plan, detail/alokasi, revisi.

import { useState, useEffect, useCallback } from "react";
import { useUiKit } from "../components/uiKit.jsx";

import { fmtMoney as fmtRp } from "../lib/currency.js";
const AC = "#4f46e5";

export default function AdminBudgetPlan({ apiBase = "" }) {
  const { confirm } = useUiKit();
  const [d, setD] = useState(null);
  const [period, setPeriod] = useState(null);
  const [form, setForm] = useState({ category: "", allocated: "" });
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState(null);

  const load = useCallback((pid) => {
    const q = pid ? `?period=${pid}` : "";
    fetch(`${apiBase}/api/budget-plan${q}`).then(r => r.json()).then(j => {
      setD(j); setPeriod(j.selected ? j.selected.id : null);
    }).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const post = (path, body, okMsg) => {
    fetch(`${apiBase}/api/budget-plan/${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(r => r.json()).then(j => {
      if (j.ok) { setMsg(okMsg); load(period); } else setMsg(j.error || "gagal");
    }).catch(e => setMsg(String(e)));
  };
  const newPeriod = () => {
    const n = window.prompt("Nama periode budget baru (mis. Q3 2026):", "");
    if (!n) return;
    post("period", { name: n, period_type: "Quarterly" }, `✓ Periode "${n}" dibuat`);
  };
  const addLine = () => {
    if (!form.category.trim() || !(Number(form.allocated) > 0)) { setMsg("⚠ Kategori & jumlah wajib"); return; }
    post("line", { period_id: period, category: form.category, allocated: Number(form.allocated) }, "✓ Detail budget ditambah");
    setForm({ category: "", allocated: "" });
  };
  const revise = (line, type) => {
    const a = window.prompt(`${type === "increase" ? "Add" : "Kurangi"} budget — ${line.category}\nAlokasi saat ini: ${fmtRp(line.allocated)}\n\nQuantity:`, "");
    if (a == null || !(Number(a) > 0)) return;
    const reason = window.prompt("Alasan revisi:", "") || "Revisi budget";
    post("revise", { line_id: line.id, rev_type: type, amount: Number(a), reason, by: "Finance" },
      `✓ Budget ${line.category} ${type === "increase" ? "+" : "−"}${fmtRp(Number(a))}`);
  };

  const saveEdit = async () => {
    const r = await fetch(`${apiBase}/api/budget-plan/line/${editing.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: editing.category,
        allocated: Number(editing.allocated) || 0,
        base_amount: Number(editing.base_amount) || 0,
        notes: editing.notes || "",
      }),
    });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Disimpan"); setEditing(null); load(period); }
    else setMsg(j.error || "gagal");
  };
  const remove = async (line) => {
    const ok = await confirm({
      title: `Hapus alokasi "${line.category}"?`,
      message: "Alokasi & semua revisi terkait akan dihapus permanen. Tidak bisa dibatalkan.",
      danger: true, okLabel: "Delete",
    });
    if (!ok) return;
    const r = await fetch(`${apiBase}/api/budget-plan/line/${line.id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Dihapus"); load(period); }
    else setMsg(j.error || "gagal");
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Budget Planning…</div>;
  const sel = d.selected;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        📋 <b style={{ color: "#818cf8" }}>BUDGET PLANNING</b> — budget per periode, detail alokasi per
        kategori, revisi increase/decrease dengan jejak audit. Perencanaan budget enterprise.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Periode Budget" v={String(s.periods)} c={AC} />
        <Kpi label="Total Plan Active" v={fmtRp(s.active_total)} c="#10b981" />
        <Kpi label="Total Revisi" v={String(s.revisions)} c="#f59e0b" />
        <Kpi label="Net Revisi" v={(s.net_revision >= 0 ? "+" : "") + fmtRp(s.net_revision)} c={s.net_revision >= 0 ? "#10b981" : "#ef4444"} />
      </div>

      {/* Period selector */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={S.kicker}>📅 PERIODE:</span>
          {d.periods.map(p => (
            <button key={p.id} onClick={() => { setPeriod(p.id); load(p.id); }}
              style={{ ...S.chip, ...(p.id === period ? { background: AC, border: `1px solid ${AC}`, color: "#fff" } : {}) }}>
              {p.name} {p.status === "active" ? "●" : ""}
            </button>
          ))}
          <button onClick={newPeriod} style={{ ...S.chip, color: "#818cf8", border: "1px solid #4f46e555" }}>+ Periode Baru</button>
          {msg ? <span style={{ marginLeft: "auto", fontSize: 12, color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</span> : null}
        </div>
      </div>

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: 12, padding: 22, width: 460, maxWidth: "92vw", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#e6edf3", marginBottom: 12 }}>Edit Alokasi — #{editing.id}</div>
            <div style={{ display: "grid", gap: 9 }}>
              <label style={{ fontSize: 11, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>KATEGORI
                <input value={editing.category || ""} onChange={e => setEditing({ ...editing, category: e.target.value })} style={modalInp} />
              </label>
              <label style={{ fontSize: 11, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>ALOKASI SAAT INI (Rp)
                <input value={editing.allocated || ""} onChange={e => setEditing({ ...editing, allocated: e.target.value })} type="number" style={modalInp} />
              </label>
              <label style={{ fontSize: 11, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>BASE PLAN (Rp)
                <input value={editing.base_amount || ""} onChange={e => setEditing({ ...editing, base_amount: e.target.value })} type="number" style={modalInp} />
              </label>
              <label style={{ fontSize: 11, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>CATATAN
                <input value={editing.notes || ""} onChange={e => setEditing({ ...editing, notes: e.target.value })} style={modalInp} />
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
              <button onClick={() => setEditing(null)} style={{ background: "transparent", border: "1px solid #21262d", color: "#9da7b3", padding: "8px 14px", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              <button onClick={saveEdit} style={{ background: AC, border: "none", color: "#fff", padding: "8px 16px", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>💾 Simpan</button>
            </div>
          </div>
        </div>
      )}

      {sel && (
        <>
          {/* Budget detail */}
          <div style={{ ...S.card, marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={S.kicker}>💰 DETAIL ALOKASI — {sel.name} ({sel.status})</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: "#10b981", fontFamily: "'Geist Mono',monospace" }}>TOTAL {fmtRp(sel.total_plan)}</span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
              <thead>
                <tr style={{ color: "#5b6470", fontSize: 10, textAlign: "left" }}>
                  {["KATEGORI", "BASE PLAN", "ALOKASI SAAT INI", "SELISIH", "REVISI"].map(h => <th key={h} style={{ padding: "6px 8px", fontWeight: 600 }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {sel.lines.map(l => {
                  const diff = l.allocated - (l.base_amount || 0);
                  return (
                    <tr key={l.id} style={{ borderTop: "1px solid #161b22", fontSize: 12 }}>
                      <td style={{ ...S.td, color: "#e6edf3", fontWeight: 600 }}>{l.category}</td>
                      <td style={{ ...S.td, ...S.mono, color: "#5b6470" }}>{fmtRp(l.base_amount)}</td>
                      <td style={{ ...S.td, ...S.mono, fontWeight: 700, color: "#10b981" }}>{fmtRp(l.allocated)}</td>
                      <td style={{ ...S.td, ...S.mono, color: diff > 0 ? "#34d399" : diff < 0 ? "#f87171" : "#5b6470" }}>{diff === 0 ? "—" : (diff > 0 ? "+" : "") + fmtRp(diff)}</td>
                      <td style={S.td}>
                        <button onClick={() => revise(l, "increase")} style={S.btnSm("#10b981")}>+ Naik</button>
                        <button onClick={() => revise(l, "decrease")} style={{ ...S.btnSm("#ef4444"), marginLeft: 4 }}>− Turun</button>
                        <button onClick={() => setEditing({ ...l })} title="Edit" style={{ background: "#f59e0b18", border: "1px solid #f59e0b44", color: "#f59e0b", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700, marginLeft: 4 }}>✏️</button>
                        <button onClick={() => remove(l)} title="Delete" style={{ background: "#ef444418", border: "1px solid #ef444444", color: "#ef4444", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700, marginLeft: 4 }}>🗑️</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="Kategori budget baru" style={{ ...S.input, flex: 2 }} />
              <input value={form.allocated} onChange={e => setForm({ ...form, allocated: e.target.value })} placeholder="Alokasi (Rp)" type="number" style={{ ...S.input, flex: 1 }} />
              <button onClick={addLine} style={S.btn}>+ Alokasi</button>
            </div>
          </div>

          {/* Revisions */}
          <div style={{ ...S.card, marginTop: 14 }}>
            <div style={S.kicker}>🔁 RIWAYAT REVISI — {sel.revisions.length}</div>
            {sel.revisions.length === 0 ? (
              <div style={{ fontSize: 12, color: "#5b6470", padding: "10px 0" }}>No revisi di periode ini.</div>
            ) : sel.revisions.map(r => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid #161b22", fontSize: 12 }}>
                <span style={{ fontSize: 14 }}>{r.rev_type === "increase" ? "⬆️" : "⬇️"}</span>
                <span style={{ width: 150, color: "#e6edf3", fontWeight: 600 }}>{r.category}</span>
                <span style={{ flex: 1, color: "#9da7b3" }}>{r.reason}</span>
                <span style={{ color: "#5b6470", fontSize: 10 }}>{r.by_who}</span>
                <span style={{ width: 120, textAlign: "right", fontFamily: "'Geist Mono',monospace", fontWeight: 700, color: r.rev_type === "increase" ? "#10b981" : "#f87171" }}>
                  {r.rev_type === "increase" ? "+" : "−"}{fmtRp(r.amount)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, v, c }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Geist Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: c, fontFamily: "'Geist Mono',monospace", marginTop: 4 }}>{v}</div>
    </div>
  );
}

const modalInp = { background: "#0a0e16", border: "1px solid #30363d", borderRadius: 7, padding: "8px 11px", color: "#e6edf3", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", width: "100%" };

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Geist Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  td: { padding: "8px 8px" },
  mono: { fontFamily: "'Geist Mono',monospace" },
  chip: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 7, padding: "6px 12px", fontSize: 12, fontWeight: 600, color: "#9da7b3", cursor: "pointer", fontFamily: "inherit" },
  input: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 7, padding: "8px 10px", color: "#e6edf3", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" },
  btn: { background: "#4f46e5", color: "#fff", border: "none", borderRadius: 7, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
  btnSm: (c) => ({ background: c + "1f", border: `1px solid ${c}55`, color: c, fontSize: 11, fontWeight: 700, padding: "4px 9px", borderRadius: 5, cursor: "pointer", fontFamily: "'Geist Mono',monospace" }),
};
