// src/Admin/AdminAutoReorder.jsx
// Auto-Reorder Engine — integrasi Inventory → Procurement.

import { useState, useEffect, useCallback } from "react";
import { useUiKit } from "../components/uiKit.jsx";

const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const AC = "#3730a3";
const ST = { reorder: { c: "#ef4444", l: "PERLU REORDER" }, watch: { c: "#f59e0b", l: "PANTAU" }, ok: { c: "#10b981", l: "AMAN" } };
const PRIORITIES = ["low", "normal", "high", "urgent"];
const STATUSES = ["draft", "submitted", "approved", "rejected", "cancelled"];
const fmtDate = (ts) => ts ? new Date(ts * 1000).toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : "—";

export default function AdminAutoReorder({ apiBase = "" }) {
  const { confirm } = useUiKit();
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/auto-reorder`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const generate = () => {
    setBusy(true); setMsg("");
    fetch(`${apiBase}/api/auto-reorder/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      .then(r => r.json()).then(j => {
        if (j.ok) setMsg(`✓ ${j.pr_number} dibuat — ${j.items} item · ${fmtRp(j.total_estimated)}. Masuk ke chain Procurement.`);
        else setMsg(j.error || "gagal");
        load();
      }).catch(e => setMsg(String(e))).finally(() => setBusy(false));
  };

  const saveEdit = async () => {
    const payload = {
      priority: editing.priority,
      status: editing.status,
      notes: editing.notes,
      department: editing.department,
    };
    const r = await fetch(`${apiBase}/api/auto-reorder/${editing.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Disimpan"); setEditing(null); load(); }
    else setMsg(j.error || "gagal");
  };

  const remove = async (item) => {
    const ok = await confirm({ title: `Hapus "${item.pr_number || '#' + item.id}"?`, message: "Akan dihapus permanen. Tidak bisa dibatalkan.", danger: true, okLabel: "Delete" });
    if (!ok) return;
    const r = await fetch(`${apiBase}/api/auto-reorder/${item.id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Dihapus"); load(); }
    else setMsg(j.error || "gagal");
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Auto-Reorder Engine…</div>;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        🔁 <b style={{ color: "#a5b4fc" }}>AUTO-REORDER ENGINE</b> — integrasi <b>Inventory → Procurement</b>.
        Stok yang mencapai reorder point otomatis dibikinin Purchase Request → masuk chain PR → PO → GD → GR.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Item Gudang" v={String(s.total_items)} c="#a5b4fc" />
        <Kpi label="Perlu Reorder" v={String(s.needs_reorder)} c={s.needs_reorder > 0 ? "#ef4444" : "#10b981"} />
        <Kpi label="Estimasi Biaya Reorder" v={fmtRp(s.est_reorder_cost)} c="#f59e0b" />
        <Kpi label="PR Ter-generate" v={String(s.prs_generated)} c="#10b981" />
      </div>

      {s.needs_reorder > 0 && (
        <div style={{ ...S.card, marginTop: 14, borderColor: "#ef444444", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "#9da7b3" }}>
            ⚠️ <b style={{ color: "#f87171" }}>{s.needs_reorder} item</b> mencapai reorder point — estimasi {fmtRp(s.est_reorder_cost)}.
          </span>
          <button onClick={generate} disabled={busy} style={S.btn}>{busy ? "Memproses…" : "⚡ Generate Purchase Request"}</button>
        </div>
      )}
      {msg ? <div style={{ fontSize: 12, margin: "8px 2px", color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>📦 ANALISA STOK — urut paling kritis</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
          <thead>
            <tr style={{ color: "#5b6470", fontSize: 10, textAlign: "left" }}>
              {["SKU", "ITEM", "STOK", "REORDER POINT", "QTY REORDER", "SUPPLIER", "EST. BIAYA", "STATUS"].map(h => <th key={h} style={{ padding: "6px 8px", fontWeight: 600 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {d.items.map(it => {
              const st = ST[it.status];
              return (
                <tr key={it.sku} style={{ borderTop: "1px solid #161b22", fontSize: 12 }}>
                  <td style={{ ...S.td, ...S.mono, color: "#5b6470" }}>{it.sku}</td>
                  <td style={{ ...S.td, color: "#e6edf3", fontWeight: 600 }}>{it.name}</td>
                  <td style={{ ...S.td, ...S.mono, fontWeight: 700, color: st.c }}>{it.stock} {it.unit}</td>
                  <td style={{ ...S.td, ...S.mono, color: "#9da7b3" }}>{it.reorder_point}</td>
                  <td style={{ ...S.td, ...S.mono, color: "#9da7b3" }}>{it.reorder_qty} {it.unit}</td>
                  <td style={{ ...S.td, color: "#9da7b3" }}>{it.supplier}</td>
                  <td style={{ ...S.td, ...S.mono, color: "#9da7b3" }}>{it.status === "reorder" ? fmtRp(it.est_total) : "—"}</td>
                  <td style={S.td}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: st.c, background: st.c + "1f", border: `1px solid ${st.c}55`, borderRadius: 5, padding: "2px 7px", fontFamily: "'Geist Mono',monospace" }}>{st.l}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🧾 PR TER-GENERATE OTOMATIS — {d.generated_prs.length}</div>
        {d.generated_prs.length === 0 ? (
          <div style={{ fontSize: 12, color: "#5b6470", padding: "10px 0" }}>No PR auto-generated. Klik "Generate" di atas.</div>
        ) : d.generated_prs.map(pr => (
          <div key={pr.pr_number} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderTop: "1px solid #161b22", fontSize: 12 }}>
            <span style={{ fontFamily: "'Geist Mono',monospace", fontWeight: 700, color: "#a5b4fc" }}>{pr.pr_number}</span>
            <span style={{ flex: 1, color: "#9da7b3" }}>{pr.items} item · {fmtDate(pr.created_at)}</span>
            <span style={{ fontFamily: "'Geist Mono',monospace", color: "#cdd5df" }}>{fmtRp(pr.total_estimated)}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#10b981", fontFamily: "'Geist Mono',monospace" }}>→ {pr.status.toUpperCase()}</span>
            <button onClick={() => setEditing({ ...pr })} title="Edit" style={{ background: "#f59e0b18", border: "1px solid #f59e0b44", color: "#f59e0b", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>✏️</button>
            <button onClick={() => remove(pr)} title="Delete" style={{ background: "#ef444418", border: "1px solid #ef444444", color: "#ef4444", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>🗑️</button>
          </div>
        ))}
      </div>

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 12, padding: 22, maxWidth: 540, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 14 }}>✏️ Edit PR — {editing.pr_number || '#' + editing.id}</div>
            <div style={{ display: "grid", gap: 10 }}>
              <label style={{ fontSize: 11, color: "#9ca3af" }}>Department
                <input value={editing.department || ""} onChange={e => setEditing({ ...editing, department: e.target.value })} style={modalInp} />
              </label>
              <label style={{ fontSize: 11, color: "#9ca3af" }}>Priority
                <select value={editing.priority || "normal"} onChange={e => setEditing({ ...editing, priority: e.target.value })} style={modalInp}>
                  {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 11, color: "#9ca3af" }}>Status
                <select value={editing.status || "submitted"} onChange={e => setEditing({ ...editing, status: e.target.value })} style={modalInp}>
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 11, color: "#9ca3af" }}>Notes
                <textarea value={editing.notes || ""} onChange={e => setEditing({ ...editing, notes: e.target.value })} rows={3} style={{ ...modalInp, resize: "vertical" }} />
              </label>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button onClick={() => setEditing(null)} style={{ background: "#161b22", border: "1px solid #30363d", color: "#9ca3af", padding: "8px 14px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Cancel</button>
              <button onClick={saveEdit} style={{ background: "#10b981", color: "#04130c", border: "none", padding: "8px 18px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>💾 Simpan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const modalInp = { background: "#0a0e16", border: "1px solid #30363d", borderRadius: 7, padding: "8px 11px", color: "#e6edf3", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", width: "100%" };

function Kpi({ label, v, c }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Geist Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: c, fontFamily: "'Geist Mono',monospace", marginTop: 4 }}>{v}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Geist Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  td: { padding: "8px 8px" },
  mono: { fontFamily: "'Geist Mono',monospace" },
  btn: { background: "#3730a3", color: "#fff", border: "none", borderRadius: 7, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
};
