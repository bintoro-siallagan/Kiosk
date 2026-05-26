// src/Admin/AdminSalesReturn.jsx
// Sales Return — retur penjualan B2B + posting contra-revenue ke COA.

import { useState, useEffect, useCallback } from "react";
import { useUiKit } from "../components/uiKit.jsx";

const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const AC = "#7e22ce";
const REASON_C = { Rusak: "#ef4444", "Kualitas Buruk": "#a855f7", "Salah Kirim": "#3b82f6", "Tidak Sesuai Pesanan": "#f59e0b" };

export default function AdminSalesReturn({ apiBase = "" }) {
  const { confirm } = useUiKit();
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(null);
  const [form, setForm] = useState({ customer_name: "", so_ref: "", reason: "Rusak", iname: "", iqty: "", iprice: "", items: [] });
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/sales-return`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const addItem = () => {
    if (!form.iname.trim() || !(Number(form.iqty) > 0) || !(Number(form.iprice) > 0)) { setMsg("⚠ Item, qty & harga wajib"); return; }
    setForm({ ...form, items: [...form.items, { name: form.iname, qty: Number(form.iqty), unit: "pcs", unit_price: Number(form.iprice) }], iname: "", iqty: "", iprice: "" });
    setMsg("");
  };
  const create = () => {
    if (!form.customer_name.trim() || !form.items.length) { setMsg("⚠ Customer & minimal 1 item wajib"); return; }
    fetch(`${apiBase}/api/sales-return`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customer_name: form.customer_name, so_ref: form.so_ref, reason: form.reason, items: form.items }),
    }).then(r => r.json()).then(j => {
      if (j.ok) { setMsg("✓ Sales Return dibuat"); setForm({ ...form, customer_name: "", so_ref: "", items: [] }); load(); }
      else setMsg(j.error || "gagal");
    }).catch(e => setMsg(String(e)));
  };
  const complete = (r) => {
    fetch(`${apiBase}/api/sales-return/${r.id}/complete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      .then(x => x.json()).then(j => { if (j.ok) { setMsg(`✓ ${r.return_no} diproses`); load(); } else setMsg(j.error || "gagal"); }).catch(e => setMsg(String(e)));
  };
  const saveEdit = async () => {
    const r = await fetch(`${apiBase}/api/sales-return/${editing.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing),
    });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Disimpan"); setEditing(null); load(); }
    else setMsg(j.error || "gagal");
  };
  const remove = async (item) => {
    const ok = await confirm({ title: `Hapus "${item.return_no || '#' + item.id}"?`, message: "Akan dihapus permanen. Tidak bisa dibatalkan.", danger: true, okLabel: "Delete" });
    if (!ok) return;
    const r = await fetch(`${apiBase}/api/sales-return/${item.id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Dihapus"); load(); }
    else setMsg(j.error || "gagal");
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Sales Return…</div>;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        ↪️ <b style={{ color: "#c084fc" }}>SALES RETURN</b> — retur penjualan B2B (customer balikin barang).
        Posting contra-revenue otomatis ke COA: Retur Penjualan + reverse PPN.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Retur" v={String(s.total)} c={AC} />
        <Kpi label="Draft" v={String(s.draft)} c={s.draft > 0 ? "#f59e0b" : "#10b981"} />
        <Kpi label="Diproses" v={String(s.completed)} c="#10b981" />
        <Kpi label="Total Nilai Retur" v={fmtRp(s.total_value)} c="#c084fc" />
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>➕ BUAT SALES RETURN</div>
        <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1fr 1.2fr", gap: 8, marginTop: 10 }}>
          <input value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} placeholder="Nama customer" style={S.input} />
          <input value={form.so_ref} onChange={e => setForm({ ...form, so_ref: e.target.value })} placeholder="SO Ref" style={S.input} />
          <select value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} style={S.input}>
            {d.reasons.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 0.8fr 1fr auto", gap: 8, marginTop: 8 }}>
          <input value={form.iname} onChange={e => setForm({ ...form, iname: e.target.value })} placeholder="Nama item" style={S.input} />
          <input value={form.iqty} onChange={e => setForm({ ...form, iqty: e.target.value })} placeholder="Qty" type="number" style={S.input} />
          <input value={form.iprice} onChange={e => setForm({ ...form, iprice: e.target.value })} placeholder="Harga/unit" type="number" style={S.input} />
          <button onClick={addItem} style={S.btnGhost}>+ Item</button>
        </div>
        {form.items.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 12, color: "#9da7b3" }}>
            {form.items.map((it, i) => <span key={i} style={{ marginRight: 10 }}>{it.name} {it.qty}× {fmtRp(it.unit_price)}</span>)}
          </div>
        )}
        <button onClick={create} style={{ ...S.btn, marginTop: 10 }}>+ Buat Retur</button>
        {msg ? <div style={{ fontSize: 12, marginTop: 8, color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>↪️ DAFTAR SALES RETURN — {d.returns.length}</div>
        <div style={{ display: "grid", gap: 9, marginTop: 10 }}>
          {d.returns.map(r => {
            const done = r.status === "completed";
            return (
              <div key={r.id} style={{ background: "#0a0e16", border: "1px solid #161b22", borderLeft: `3px solid ${done ? "#10b981" : "#f59e0b"}`, borderRadius: 9, padding: "11px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>{r.return_no} <span style={{ color: "#5b6470", fontWeight: 400, fontSize: 11 }}>· {r.customer_name}</span></div>
                    <div style={{ fontSize: 10, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>ref {r.so_ref} · {r.items.length} item</div>
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 700, color: REASON_C[r.reason] || "#9ca3af", background: (REASON_C[r.reason] || "#9ca3af") + "1f", border: `1px solid ${(REASON_C[r.reason] || "#9ca3af")}55`, borderRadius: 5, padding: "2px 8px", fontFamily: "'Geist Mono',monospace" }}>{r.reason}</span>
                  <span style={{ fontFamily: "'Geist Mono',monospace", fontWeight: 700, color: "#c084fc", width: 110, textAlign: "right" }}>{fmtRp(r.total)}</span>
                  {done
                    ? <span style={{ fontSize: 10, fontWeight: 700, color: "#10b981", fontFamily: "'Geist Mono',monospace", width: 86, textAlign: "right" }}>✓ DIPROSES</span>
                    : <button onClick={() => complete(r)} style={S.act}>Proses</button>}
                  <button onClick={() => setOpen(open === r.id ? null : r.id)} style={S.btnGhost}>{open === r.id ? "▲" : "▼ COA"}</button>
                  <button onClick={() => setEditing({ ...r })} title="Edit" style={{ background: "#f59e0b18", border: "1px solid #f59e0b44", color: "#f59e0b", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>✏️</button>
                  <button onClick={() => remove(r)} title="Delete" style={{ background: "#ef444418", border: "1px solid #ef444444", color: "#ef4444", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>🗑️</button>
                </div>
                {open === r.id && (
                  <div style={{ marginTop: 9, background: "#0d1117", border: "1px solid #161b22", borderRadius: 7, padding: "9px 11px" }}>
                    <div style={{ fontSize: 10, color: "#5b6470", fontFamily: "'Geist Mono',monospace", marginBottom: 5 }}>POSTING CONTRA-REVENUE → CHART OF ACCOUNTS</div>
                    {r.coa_posting.map((l, i) => (
                      <div key={i} style={{ display: "flex", fontSize: 11, padding: "2px 0", fontFamily: "'Geist Mono',monospace" }}>
                        <span style={{ width: 60, color: "#60a5fa" }}>{l.code}</span>
                        <span style={{ flex: 1, color: "#cdd5df", paddingLeft: l.credit > 0 ? 20 : 0 }}>{l.account}</span>
                        <span style={{ width: 110, textAlign: "right", color: "#10b981" }}>{l.debit > 0 ? fmtRp(l.debit) : ""}</span>
                        <span style={{ width: 110, textAlign: "right", color: "#f59e0b" }}>{l.credit > 0 ? fmtRp(l.credit) : ""}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 12, padding: 22, maxWidth: 540, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 14 }}>✏️ Edit — {editing.return_no || '#' + editing.id}</div>
            <div style={{ display: "grid", gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>No. Retur</div>
                <input value={editing.return_no || ""} onChange={e => setEditing({ ...editing, return_no: e.target.value })} style={modalInp} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>SO Ref</div>
                <input value={editing.so_ref || ""} onChange={e => setEditing({ ...editing, so_ref: e.target.value })} style={modalInp} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>Customer</div>
                <input value={editing.customer_name || ""} onChange={e => setEditing({ ...editing, customer_name: e.target.value })} style={modalInp} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>Alasan</div>
                <select value={editing.reason || "Rusak"} onChange={e => setEditing({ ...editing, reason: e.target.value })} style={modalInp}>
                  {(d.reasons || []).map(rn => <option key={rn} value={rn}>{rn}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>Status</div>
                <select value={editing.status || "draft"} onChange={e => setEditing({ ...editing, status: e.target.value })} style={modalInp}>
                  <option value="draft">draft</option>
                  <option value="completed">completed</option>
                </select>
              </div>
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
      <div style={{ fontSize: 17, fontWeight: 800, color: c, fontFamily: "'Geist Mono',monospace", marginTop: 4 }}>{v}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Geist Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  input: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 7, padding: "8px 9px", color: "#e6edf3", fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" },
  btn: { background: "#7e22ce", color: "#fff", border: "none", borderRadius: 7, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnGhost: { background: "#161b22", color: "#9da7b3", border: "1px solid #21262d", borderRadius: 7, padding: "6px 11px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
  act: { background: "#7e22ce", color: "#fff", border: "none", borderRadius: 6, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
};
