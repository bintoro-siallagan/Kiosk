// src/Admin/AdminRfq.jsx
// RFQ / Tender — banding penawaran multi-vendor sebelum PO.

import { useState, useEffect, useCallback } from "react";
import { useUiKit } from "../components/uiKit.jsx";

const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const AC = "#0891b2";

export default function AdminRfq({ apiBase = "" }) {
  const { confirm } = useUiKit();
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ item: "", qty: "", unit: "pcs" });
  const [quote, setQuote] = useState({});
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/rfq`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const post = (url, body, ok) => fetch(`${apiBase}${url}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}),
  }).then(r => r.json()).then(j => { if (j.ok) { setMsg(ok); load(); } else setMsg(j.error || "gagal"); }).catch(e => setMsg(String(e)));

  const addRfq = () => {
    if (!form.item.trim()) { setMsg("⚠ Item wajib"); return; }
    post("/api/rfq", { ...form, qty: Number(form.qty) || 0 }, "✓ RFQ dibuat");
    setForm({ item: "", qty: "", unit: "pcs" });
  };
  const addQuote = (r) => {
    const q = quote[r.id] || {};
    if (!q.vendor || !(Number(q.price) > 0)) { setMsg("⚠ Vendor & harga wajib"); return; }
    post(`/api/rfq/${r.id}/quote`, { vendor: q.vendor, price: Number(q.price), lead_days: Number(q.lead_days) || 0 }, "✓ Penawaran ditambah");
    setQuote({ ...quote, [r.id]: {} });
  };

  const saveEdit = async () => {
    const r = await fetch(`${apiBase}/api/rfq/${editing.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing),
    });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Disimpan"); setEditing(null); load(); }
    else setMsg(j.error || "gagal");
  };

  const remove = async (item) => {
    const ok = await confirm({ title: `Hapus "${item.item || item.rfq_no || '#'+item.id}"?`, message: "Akan dihapus permanen. Tidak bisa dibatalkan.", danger: true, okLabel: "Delete" });
    if (!ok) return;
    const r = await fetch(`${apiBase}/api/rfq/${item.id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Dihapus"); load(); }
    else setMsg(j.error || "gagal");
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat RFQ / Tender…</div>;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        📨 <b style={{ color: "#22d3ee" }}>RFQ / TENDER</b> — banding penawaran multi-vendor sebelum PO.
        Minta quote, bandingkan harga &amp; lead time, pilih pemenang.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total RFQ" v={String(s.total)} c={AC} />
        <Kpi label="Open" v={String(s.open)} c={s.open > 0 ? "#f59e0b" : "#5b6470"} />
        <Kpi label="Awarded" v={String(s.awarded)} c="#10b981" />
        <Kpi label="Total Penawaran" v={String(s.total_quotes)} c="#a855f7" />
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>➕ BUAT RFQ BARU</div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 8, marginTop: 10 }}>
          <input value={form.item} onChange={e => setForm({ ...form, item: e.target.value })} placeholder="Item yang dibutuhkan" style={S.input} />
          <input value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} placeholder="Qty" type="number" style={S.input} />
          <input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="Satuan" style={S.input} />
          <button onClick={addRfq} style={S.btn}>+ RFQ</button>
        </div>
        {msg ? <div style={{ fontSize: 12, marginTop: 8, color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}
      </div>

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 12, padding: 22, maxWidth: 540, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 14 }}>✏️ Edit — {editing.rfq_no || '#'+editing.id}</div>
            <div style={{ display: "grid", gap: 10 }}>
              <label style={{ fontSize: 11, color: "#9ca3af" }}>No RFQ
                <input value={editing.rfq_no || ""} onChange={e => setEditing({ ...editing, rfq_no: e.target.value })} style={modalInp} />
              </label>
              <label style={{ fontSize: 11, color: "#9ca3af" }}>Item
                <input value={editing.item || ""} onChange={e => setEditing({ ...editing, item: e.target.value })} style={modalInp} />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label style={{ fontSize: 11, color: "#9ca3af" }}>Qty
                  <input type="number" value={editing.qty || ""} onChange={e => setEditing({ ...editing, qty: Number(e.target.value) })} style={modalInp} />
                </label>
                <label style={{ fontSize: 11, color: "#9ca3af" }}>Satuan
                  <input value={editing.unit || ""} onChange={e => setEditing({ ...editing, unit: e.target.value })} style={modalInp} />
                </label>
              </div>
              <label style={{ fontSize: 11, color: "#9ca3af" }}>Status
                <select value={editing.status || "open"} onChange={e => setEditing({ ...editing, status: e.target.value })} style={modalInp}>
                  <option value="open">open</option>
                  <option value="awarded">awarded</option>
                  <option value="closed">closed</option>
                </select>
              </label>
              <label style={{ fontSize: 11, color: "#9ca3af" }}>Awarded Vendor
                <input value={editing.awarded_vendor || ""} onChange={e => setEditing({ ...editing, awarded_vendor: e.target.value })} style={modalInp} />
              </label>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button onClick={() => setEditing(null)} style={{ background: "#161b22", border: "1px solid #30363d", color: "#9ca3af", padding: "8px 14px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Cancel</button>
              <button onClick={saveEdit} style={{ background: "#10b981", color: "#04130c", border: "none", padding: "8px 18px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>💾 Simpan</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
        {d.rfqs.map(r => {
          const q = quote[r.id] || {};
          return (
            <div key={r.id} style={S.card}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>{r.item} <span style={{ color: "#5b6470", fontWeight: 400, fontSize: 11 }}>· {r.qty} {r.unit}</span></div>
                  <div style={{ fontSize: 10, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>{r.rfq_no}</div>
                </div>
                {r.status === "awarded"
                  ? <span style={{ fontSize: 10, fontWeight: 700, color: "#10b981", background: "#10b9811f", border: "1px solid #10b98155", borderRadius: 5, padding: "3px 9px", fontFamily: "'Geist Mono',monospace" }}>✓ AWARD: {r.awarded_vendor}</span>
                  : <button onClick={() => post(`/api/rfq/${r.id}/award`, {}, "✓ RFQ di-award ke penawaran terbaik")} style={S.btn} disabled={!r.best}>🏆 Award Termurah</button>}
                <button onClick={() => setEditing({ ...r })} title="Edit" style={{ background: "#f59e0b18", border: "1px solid #f59e0b44", color: "#f59e0b", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>✏️</button>
                <button onClick={() => remove(r)} title="Delete" style={{ background: "#ef444418", border: "1px solid #ef444444", color: "#ef4444", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>🗑️</button>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
                <thead><tr style={{ color: "#5b6470", fontSize: 10, textAlign: "left" }}>
                  {["VENDOR", "HARGA SATUAN", "TOTAL", "LEAD TIME", ""].map(h => <th key={h} style={{ padding: "5px 8px", fontWeight: 600 }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {r.quotes.map((qt, i) => {
                    const best = r.best && qt.vendor === r.best.vendor;
                    return (
                      <tr key={i} style={{ borderTop: "1px solid #161b22", fontSize: 12, background: best ? "#10b9810d" : "transparent" }}>
                        <td style={{ ...S.td, color: "#e6edf3", fontWeight: 600 }}>{qt.vendor} {best && <span style={{ fontSize: 9, color: "#10b981" }}>● TERMURAH</span>}</td>
                        <td style={{ ...S.td, ...S.mono, color: "#9da7b3" }}>{fmtRp(qt.price)}</td>
                        <td style={{ ...S.td, ...S.mono, color: best ? "#10b981" : "#cdd5df", fontWeight: 700 }}>{fmtRp(qt.price * r.qty)}</td>
                        <td style={{ ...S.td, color: "#9da7b3" }}>{qt.lead_days} hari</td>
                        <td style={S.td} />
                      </tr>
                    );
                  })}
                  {r.quotes.length === 0 && <tr><td colSpan={5} style={{ ...S.td, color: "#5b6470" }}>No penawaran</td></tr>}
                </tbody>
              </table>
              {r.status === "open" && (
                <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr auto", gap: 7, marginTop: 8 }}>
                  <input value={q.vendor || ""} onChange={e => setQuote({ ...quote, [r.id]: { ...q, vendor: e.target.value } })} placeholder="Vendor" style={S.input} />
                  <input value={q.price || ""} onChange={e => setQuote({ ...quote, [r.id]: { ...q, price: e.target.value } })} placeholder="Harga satuan" type="number" style={S.input} />
                  <input value={q.lead_days || ""} onChange={e => setQuote({ ...quote, [r.id]: { ...q, lead_days: e.target.value } })} placeholder="Lead (hari)" type="number" style={S.input} />
                  <button onClick={() => addQuote(r)} style={S.btnGhost}>+ Penawaran</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Kpi({ label, v, c }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Geist Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: c, fontFamily: "'Geist Mono',monospace", marginTop: 4 }}>{v}</div>
    </div>
  );
}

const modalInp = { background: "#0a0e16", border: "1px solid #30363d", borderRadius: 7, padding: "8px 11px", color: "#e6edf3", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", width: "100%" };

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Geist Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  td: { padding: "6px 8px" },
  mono: { fontFamily: "'Geist Mono',monospace" },
  input: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 7, padding: "8px 9px", color: "#e6edf3", fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" },
  btn: { background: "#0891b2", color: "#fff", border: "none", borderRadius: 7, padding: "7px 13px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
  btnGhost: { background: "#161b22", color: "#9da7b3", border: "1px solid #21262d", borderRadius: 7, padding: "8px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
};
