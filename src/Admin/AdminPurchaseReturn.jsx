// src/Admin/AdminPurchaseReturn.jsx
// Purchase Return — retur barang ke supplier.

import { useState, useEffect, useCallback } from "react";

const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const AC = "#be123c";
const fmtDate = (ts) => ts ? new Date(ts * 1000).toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : "—";
const REASON_C = { Rusak: "#ef4444", Kedaluwarsa: "#f59e0b", "Salah Kirim": "#3b82f6", "Kualitas Buruk": "#a855f7", "Kelebihan Kirim": "#0d9488" };

export default function AdminPurchaseReturn({ apiBase = "" }) {
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ supplier: "", po_ref: "", sku: "", qty: "", reason: "Rusak" });

  const load = useCallback(() => {
    fetch(`${apiBase}/api/purchase-return`).then(r => r.json()).then(j => {
      setD(j); setForm(f => f.sku ? f : { ...f, sku: (j.warehouse[0] && j.warehouse[0].id) || "" });
    }).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const create = () => {
    if (!form.supplier.trim() || !form.sku || !(Number(form.qty) > 0)) { setMsg("⚠ Supplier, item & qty wajib"); return; }
    const wh = d.warehouse.find(w => w.id === form.sku) || {};
    fetch(`${apiBase}/api/purchase-return`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplier: form.supplier, po_ref: form.po_ref, reason: form.reason,
        items: [{ sku: form.sku, name: wh.name, qty: Number(form.qty), unit: wh.unit, unit_price: wh.cost_per_unit }] }),
    }).then(r => r.json()).then(j => {
      if (j.ok) { setMsg("✓ Retur dibuat"); setForm({ ...form, supplier: "", po_ref: "", qty: "" }); load(); }
      else setMsg(j.error || "gagal");
    }).catch(e => setMsg(String(e)));
  };
  const complete = (r) => {
    fetch(`${apiBase}/api/purchase-return/${r.id}/complete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      .then(x => x.json()).then(j => { if (j.ok) { setMsg(`✓ ${r.return_no} diproses — stok ter-update`); load(); } else setMsg(j.error || "gagal"); }).catch(e => setMsg(String(e)));
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Purchase Return…</div>;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        ↩️ <b style={{ color: "#fb7185" }}>PURCHASE RETURN</b> — retur barang ke supplier (rusak,
        kedaluwarsa, salah kirim). Diproses → stok berkurang &amp; jadi klaim ke supplier.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Retur" v={String(s.total)} c={AC} />
        <Kpi label="Draft" v={String(s.draft)} c={s.draft > 0 ? "#f59e0b" : "#10b981"} />
        <Kpi label="Diproses" v={String(s.completed)} c="#10b981" />
        <Kpi label="Total Nilai Retur" v={fmtRp(s.total_value)} c="#fb7185" />
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>➕ BUAT RETUR</div>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1.4fr 0.8fr 1.2fr auto", gap: 8, marginTop: 10 }}>
          <input value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} placeholder="Supplier" style={S.input} />
          <input value={form.po_ref} onChange={e => setForm({ ...form, po_ref: e.target.value })} placeholder="PO Ref" style={S.input} />
          <select value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} style={S.input}>
            {d.warehouse.map(w => <option key={w.id} value={w.id}>{w.id} · {w.name}</option>)}
          </select>
          <input value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} placeholder="Qty" type="number" style={S.input} />
          <select value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} style={S.input}>
            {d.reasons.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <button onClick={create} style={S.btn}>+ Retur</button>
        </div>
        {msg ? <div style={{ fontSize: 12, marginTop: 8, color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>↩️ DAFTAR RETUR — {d.returns.length}</div>
        <div style={{ display: "grid", gap: 9, marginTop: 10 }}>
          {d.returns.map(r => {
            const done = r.status === "completed";
            return (
              <div key={r.id} style={{ background: "#0a0e16", border: "1px solid #161b22", borderLeft: `3px solid ${done ? "#10b981" : "#f59e0b"}`, borderRadius: 9, padding: "11px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>{r.return_no} <span style={{ color: "#5b6470", fontWeight: 400, fontSize: 11 }}>· {r.supplier}</span></div>
                    <div style={{ fontSize: 10, color: "#5b6470", fontFamily: "'Space Mono',monospace" }}>{r.po_ref} · dibuat {fmtDate(r.created_at)}{r.completed_at ? ` · diproses ${fmtDate(r.completed_at)}` : ""}</div>
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 700, color: REASON_C[r.reason] || "#9ca3af", background: (REASON_C[r.reason] || "#9ca3af") + "1f", border: `1px solid ${(REASON_C[r.reason] || "#9ca3af")}55`, borderRadius: 5, padding: "2px 8px", fontFamily: "'Space Mono',monospace" }}>{r.reason}</span>
                  <span style={{ fontFamily: "'Space Mono',monospace", fontWeight: 700, color: "#fb7185", width: 110, textAlign: "right" }}>{fmtRp(r.total_value)}</span>
                  {done
                    ? <span style={{ fontSize: 10, fontWeight: 700, color: "#10b981", fontFamily: "'Space Mono',monospace", width: 90, textAlign: "right" }}>✓ DIPROSES</span>
                    : <button onClick={() => complete(r)} style={S.act}>Proses Retur</button>}
                </div>
                <div style={{ marginTop: 7, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {r.items.map((it, i) => (
                    <span key={i} style={{ fontSize: 11, color: "#9da7b3", background: "#0d1117", border: "1px solid #161b22", borderRadius: 5, padding: "2px 8px" }}>
                      {it.name} <b style={{ color: "#cdd5df", fontFamily: "'Space Mono',monospace" }}>{it.qty} {it.unit}</b>
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, v, c }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Space Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: c, fontFamily: "'Space Mono',monospace", marginTop: 4 }}>{v}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Space Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  input: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 7, padding: "8px 9px", color: "#e6edf3", fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" },
  btn: { background: "#be123c", color: "#fff", border: "none", borderRadius: 7, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  act: { background: "#f59e0b", color: "#0a0e16", border: "none", borderRadius: 6, padding: "5px 11px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
};
