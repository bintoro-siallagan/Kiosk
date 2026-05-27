// src/Admin/AdminSalesOrder.jsx
// Sales Order — penjualan B2B (antar PT, lintas brand, korporat).

import { useState, useEffect, useCallback } from "react";
import { useUiKit , LoadingState} from "../components/uiKit.jsx";

import { fmtMoney as fmtRp } from "../lib/currency.js";
const AC = "#6d28d9";
const CT_C = { "Antar PT": "#3b82f6", "Lintas Brand": "#a855f7", Korporat: "#0d9488", Franchise: "#fbbf24" };
const STAT = { draft: { c: "#f59e0b", l: "DRAFT" }, confirmed: { c: "#3b82f6", l: "CONFIRMED" }, fulfilled: { c: "#0d9488", l: "FULFILLED" }, invoiced: { c: "#10b981", l: "INVOICED" } };
const NEXT = { draft: "Confirm", confirmed: "Fulfill", fulfilled: "Buat Invoice" };

export default function AdminSalesOrder({ apiBase = "" }) {
  const { confirm } = useUiKit();
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(null);
  const [form, setForm] = useState({ customer_type: "Korporat", customer_name: "", payment_terms: "NET 14", iname: "", iqty: "", iprice: "", items: [] });
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/sales-order`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const addItem = () => {
    if (!form.iname.trim() || !(Number(form.iqty) > 0) || !(Number(form.iprice) > 0)) { setMsg("⚠ Item, qty & harga wajib"); return; }
    setForm({ ...form, items: [...form.items, { name: form.iname, qty: Number(form.iqty), unit: "pcs", unit_price: Number(form.iprice) }], iname: "", iqty: "", iprice: "" });
    setMsg("");
  };
  const create = () => {
    if (!form.customer_name.trim() || !form.items.length) { setMsg("⚠ Customer & minimal 1 item wajib"); return; }
    fetch(`${apiBase}/api/sales-order`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customer_type: form.customer_type, customer_name: form.customer_name, payment_terms: form.payment_terms, items: form.items }),
    }).then(r => r.json()).then(j => {
      if (j.ok) { setMsg("✓ Sales Order dibuat"); setForm({ ...form, customer_name: "", items: [] }); load(); }
      else setMsg(j.error || "gagal");
    }).catch(e => setMsg(String(e)));
  };
  const advance = (o) => {
    fetch(`${apiBase}/api/sales-order/${o.id}/advance`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      .then(r => r.json()).then(j => { if (j.ok) { setMsg(`✓ ${o.so_number} → ${j.status}`); load(); } else setMsg(j.error || "gagal"); }).catch(e => setMsg(String(e)));
  };

  const saveEdit = () => {
    if (!editing) return;
    const body = {
      customer_name: editing.customer_name, customer_type: editing.customer_type,
      payment_terms: editing.payment_terms, status: editing.status,
      total: Number(editing.total) || 0, notes: editing.notes,
    };
    fetch(`${apiBase}/api/sales-order/${editing.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(r => r.json()).then(j => {
      if (j.ok) { setMsg("✓ Sales Order diupdate"); setEditing(null); load(); }
      else setMsg(j.error || "gagal");
    }).catch(e => setMsg(String(e)));
  };

  const remove = async (o) => {
    const ok = await confirm({
      title: "Hapus Sales Order?", danger: true,
      message: `Hapus ${o.so_number} (${o.customer_name}, ${fmtRp(o.total)})? Tindakan ini tidak bisa dibatalkan.`,
      okLabel: "Delete",
    });
    if (!ok) return;
    fetch(`${apiBase}/api/sales-order/${o.id}`, { method: "DELETE" })
      .then(r => r.json()).then(j => {
        if (j.ok) { setMsg("✓ Sales Order dihapus"); load(); }
        else setMsg(j.error || "gagal");
      }).catch(e => setMsg(String(e)));
  };

  if (!d) return <LoadingState label="Memuat Sales Order…" />;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        📑 <b style={{ color: "#a78bfa" }}>SALES ORDER</b> — penjualan B2B: antar PT, lintas brand &amp;
        klien korporat. Termin pembayaran, alur SO → confirm → fulfill → invoice, posting ke COA.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total SO" v={String(s.total)} c={AC} />
        <Kpi label="Masih Berjalan" v={String(s.open)} c="#f59e0b" />
        <Kpi label="Total Nilai" v={fmtRp(s.total_value)} c="#10b981" />
        <Kpi label="Outstanding" v={fmtRp(s.outstanding)} c="#ef4444" />
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>➕ BUAT SALES ORDER</div>
        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1.8fr 1fr", gap: 8, marginTop: 10 }}>
          <select value={form.customer_type} onChange={e => setForm({ ...form, customer_type: e.target.value })} style={S.input}>
            {d.customer_types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} placeholder="Nama PT / Brand / Klien" style={S.input} />
          <select value={form.payment_terms} onChange={e => setForm({ ...form, payment_terms: e.target.value })} style={S.input}>
            {d.terms.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 0.8fr 1fr auto", gap: 8, marginTop: 8 }}>
          <input value={form.iname} onChange={e => setForm({ ...form, iname: e.target.value })} placeholder="Nama item" style={S.input} />
          <input value={form.iqty} onChange={e => setForm({ ...form, iqty: e.target.value })} placeholder="Qty" type="number" style={S.input} />
          <input value={form.iprice} onChange={e => setForm({ ...form, iprice: e.target.value })} placeholder="Price/unit" type="number" style={S.input} />
          <button onClick={addItem} style={S.btnGhost}>+ Item</button>
        </div>
        {form.items.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 12, color: "#9da7b3" }}>
            {form.items.map((it, i) => <span key={i} style={{ marginRight: 10 }}>{it.name} {it.qty}× {fmtRp(it.unit_price)}</span>)}
          </div>
        )}
        <button onClick={create} style={{ ...S.btn, marginTop: 10 }}>+ Buat SO</button>
        {msg ? <div style={{ fontSize: 12, marginTop: 8, color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>📑 DAFTAR SALES ORDER — {d.orders.length}</div>
        <div style={{ display: "grid", gap: 9, marginTop: 10 }}>
          {d.orders.map(o => {
            const st = STAT[o.status] || STAT.draft, ct = CT_C[o.customer_type] || "#9ca3af";
            return (
              <div key={o.id} style={{ background: "#0a0e16", border: "1px solid #161b22", borderLeft: `3px solid ${st.c}`, borderRadius: 9, padding: "11px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>{o.so_number} <span style={{ color: "#5b6470", fontWeight: 400, fontSize: 11 }}>· {o.customer_name}</span></div>
                    <div style={{ fontSize: 10, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>{o.items.length} item · {o.payment_terms}</div>
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 700, color: ct, fontFamily: "'Geist Mono',monospace" }}>{o.customer_type.toUpperCase()}</span>
                  <span style={{ fontFamily: "'Geist Mono',monospace", fontWeight: 700, color: "#a78bfa", width: 120, textAlign: "right" }}>{fmtRp(o.total)}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: st.c, background: st.c + "1f", border: `1px solid ${st.c}55`, borderRadius: 5, padding: "2px 8px", fontFamily: "'Geist Mono',monospace" }}>{st.l}</span>
                  {NEXT[o.status] && <button onClick={() => advance(o)} style={S.act}>{NEXT[o.status]}</button>}
                  <button onClick={() => setOpen(open === o.id ? null : o.id)} style={S.btnGhost}>{open === o.id ? "▲" : "▼ COA"}</button>
                  <button onClick={() => setEditing({ ...o })} title="Edit" style={S.iconBtn("#f59e0b")}>✏️</button>
                  <button onClick={() => remove(o)} title="Delete" style={S.iconBtn("#ef4444")}>🗑️</button>
                </div>
                {open === o.id && (
                  <div style={{ marginTop: 9, background: "#0d1117", border: "1px solid #161b22", borderRadius: 7, padding: "9px 11px" }}>
                    <div style={{ fontSize: 10, color: "#5b6470", fontFamily: "'Geist Mono',monospace", marginBottom: 5 }}>POSTING JURNAL → CHART OF ACCOUNTS</div>
                    {o.coa_posting.map((l, i) => (
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
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 14 }}>✏️ Edit — {editing.so_number || '#' + editing.id}</div>
            <div style={{ display: "grid", gap: 10 }}>
              <label style={lbl}>Customer
                <input value={editing.customer_name || ""} onChange={e => setEditing({ ...editing, customer_name: e.target.value })} style={modalInp} />
              </label>
              <label style={lbl}>Tipe Customer
                <select value={editing.customer_type || "Korporat"} onChange={e => setEditing({ ...editing, customer_type: e.target.value })} style={modalInp}>
                  {(d.customer_types || []).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label style={lbl}>Termin Pembayaran
                <select value={editing.payment_terms || "NET 14"} onChange={e => setEditing({ ...editing, payment_terms: e.target.value })} style={modalInp}>
                  {(d.terms || []).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label style={lbl}>Status
                <select value={editing.status || "draft"} onChange={e => setEditing({ ...editing, status: e.target.value })} style={modalInp}>
                  <option value="draft">draft</option>
                  <option value="confirmed">confirmed</option>
                  <option value="fulfilled">fulfilled</option>
                  <option value="invoiced">invoiced</option>
                </select>
              </label>
              <label style={lbl}>Total
                <input type="number" value={editing.total || ""} onChange={e => setEditing({ ...editing, total: e.target.value })} style={modalInp} />
              </label>
              <label style={lbl}>Catatan
                <input value={editing.notes || ""} onChange={e => setEditing({ ...editing, notes: e.target.value })} style={modalInp} />
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

const lbl = { display: "grid", gap: 4, fontSize: 11, color: "#9ca3af", fontWeight: 600 };
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
  btn: { background: "#6d28d9", color: "#fff", border: "none", borderRadius: 7, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnGhost: { background: "#161b22", color: "#9da7b3", border: "1px solid #21262d", borderRadius: 7, padding: "6px 11px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
  act: { background: "#6d28d9", color: "#fff", border: "none", borderRadius: 6, padding: "5px 11px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
  iconBtn: (c) => ({ background: c + "1f", border: `1px solid ${c}55`, color: c, fontSize: 12, padding: "4px 8px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit" }),
};
