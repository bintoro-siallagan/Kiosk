// src/Admin/AdminQuotation.jsx
// Quotation — penawaran harga B2B sebelum jadi Sales Order.

import { useState, useEffect, useCallback } from "react";
import { useUiKit } from "../components/uiKit.jsx";

const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const AC = "#6366f1";
const STAT = { draft: { c: "#f59e0b", l: "DRAFT" }, sent: { c: "#3b82f6", l: "TERKIRIM" }, accepted: { c: "#10b981", l: "DITERIMA" }, rejected: { c: "#ef4444", l: "DITOLAK" } };
const NEXT = { draft: ["sent", "Kirim"], sent: ["accepted", "Tandai Diterima"] };

export default function AdminQuotation({ apiBase = "" }) {
  const { confirm } = useUiKit();
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/quotation`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const setStatus = (q, status) => {
    fetch(`${apiBase}/api/quotation/${q.id}/status`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    }).then(r => r.json()).then(j => { if (j.ok) { setMsg(`✓ ${q.quote_no} → ${status}`); load(); } else setMsg(j.error || "gagal"); }).catch(e => setMsg(String(e)));
  };

  const saveEdit = async () => {
    const r = await fetch(`${apiBase}/api/quotation/${editing.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing),
    });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Disimpan"); setEditing(null); load(); }
    else setMsg(j.error || "gagal");
  };

  const remove = async (item) => {
    const ok = await confirm({ title: `Hapus "${item.quote_no || item.customer_name || '#'+item.id}"?`, message: "Akan dihapus permanen. Tidak bisa dibatalkan.", danger: true, okLabel: "Hapus" });
    if (!ok) return;
    const r = await fetch(`${apiBase}/api/quotation/${item.id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Dihapus"); load(); }
    else setMsg(j.error || "gagal");
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Quotation…</div>;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        💬 <b style={{ color: "#a5b4fc" }}>QUOTATION</b> — penawaran harga B2B sebelum jadi Sales Order.
        Draft → kirim → diterima/ditolak. Quotation diterima = siap di-convert ke SO.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Quotation" v={String(s.total)} c={AC} />
        <Kpi label="Masih Terbuka" v={String(s.open)} c="#f59e0b" />
        <Kpi label="Win Rate" v={s.win_rate + "%"} c="#10b981" />
        <Kpi label="Total Nilai" v={fmtRp(s.value)} c="#818cf8" />
      </div>
      {msg ? <div style={{ fontSize: 12, margin: "8px 2px", color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>💬 DAFTAR QUOTATION — {d.quotations.length}</div>
        <div style={{ display: "grid", gap: 9, marginTop: 10 }}>
          {d.quotations.map(q => {
            const st = STAT[q.status] || STAT.draft, nx = NEXT[q.status];
            return (
              <div key={q.id} style={{ background: "#0a0e16", border: "1px solid #161b22", borderLeft: `3px solid ${st.c}`, borderRadius: 9, padding: "11px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>{q.quote_no} <span style={{ color: "#5b6470", fontWeight: 400, fontSize: 11 }}>· {q.customer_name}</span></div>
                  <div style={{ fontSize: 10, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>{q.customer_type} · {q.items.length} item{q.expired ? " · ⚠ EXPIRED" : ""}</div>
                </div>
                <span style={{ fontFamily: "'Geist Mono',monospace", fontWeight: 700, color: "#818cf8", width: 120, textAlign: "right" }}>{fmtRp(q.total)}</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: st.c, background: st.c + "1f", border: `1px solid ${st.c}55`, borderRadius: 5, padding: "2px 8px", fontFamily: "'Geist Mono',monospace" }}>{st.l}</span>
                {nx && <button onClick={() => setStatus(q, nx[0])} style={S.act}>{nx[1]}</button>}
                {q.status === "sent" && <button onClick={() => setStatus(q, "rejected")} style={S.actX}>Tolak</button>}
                <button onClick={() => setEditing({ ...q })} title="Edit" style={{ background: "#f59e0b18", border: "1px solid #f59e0b44", color: "#f59e0b", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>✏️</button>
                <button onClick={() => remove(q)} title="Hapus" style={{ background: "#ef444418", border: "1px solid #ef444444", color: "#ef4444", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>🗑️</button>
              </div>
            );
          })}
        </div>
      </div>

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 12, padding: 22, maxWidth: 540, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 14 }}>✏️ Edit — {editing.quote_no || '#'+editing.id}</div>
            <div style={{ display: "grid", gap: 10 }}>
              <label style={{ fontSize: 11, color: "#9ca3af" }}>No Quotation
                <input value={editing.quote_no || ""} onChange={e => setEditing({ ...editing, quote_no: e.target.value })} style={modalInp} />
              </label>
              <label style={{ fontSize: 11, color: "#9ca3af" }}>Customer
                <input value={editing.customer_name || ""} onChange={e => setEditing({ ...editing, customer_name: e.target.value })} style={modalInp} />
              </label>
              <label style={{ fontSize: 11, color: "#9ca3af" }}>Tipe Customer
                <input value={editing.customer_type || ""} onChange={e => setEditing({ ...editing, customer_type: e.target.value })} style={modalInp} />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <label style={{ fontSize: 11, color: "#9ca3af" }}>Subtotal
                  <input type="number" value={editing.subtotal ?? 0} onChange={e => setEditing({ ...editing, subtotal: Number(e.target.value) })} style={modalInp} />
                </label>
                <label style={{ fontSize: 11, color: "#9ca3af" }}>Tax
                  <input type="number" value={editing.tax ?? 0} onChange={e => setEditing({ ...editing, tax: Number(e.target.value) })} style={modalInp} />
                </label>
                <label style={{ fontSize: 11, color: "#9ca3af" }}>Total
                  <input type="number" value={editing.total ?? 0} onChange={e => setEditing({ ...editing, total: Number(e.target.value) })} style={modalInp} />
                </label>
              </div>
              <label style={{ fontSize: 11, color: "#9ca3af" }}>Status
                <select value={editing.status || "draft"} onChange={e => setEditing({ ...editing, status: e.target.value })} style={modalInp}>
                  <option value="draft">draft</option>
                  <option value="sent">sent</option>
                  <option value="accepted">accepted</option>
                  <option value="rejected">rejected</option>
                </select>
              </label>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button onClick={() => setEditing(null)} style={{ background: "#161b22", border: "1px solid #30363d", color: "#9ca3af", padding: "8px 14px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Batal</button>
              <button onClick={saveEdit} style={{ background: "#10b981", color: "#04130c", border: "none", padding: "8px 18px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>💾 Simpan</button>
            </div>
          </div>
        </div>
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
  act: { background: "#6366f1", color: "#fff", border: "none", borderRadius: 6, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
  actX: { background: "#ef444420", border: "1px solid #ef444455", color: "#f87171", borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
};
