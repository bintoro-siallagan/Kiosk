// src/Admin/AdminApAging.jsx
// AP Aging — Hutang Usaha (Accounts Payable) aging.

import { useState, useEffect, useCallback } from "react";
import { useUiKit, LoadingState } from "../components/uiKit.jsx";

const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const fmtJt = (n) => (n / 1e6).toFixed(1) + "M";
const AC = "#dc2626";
const BUCKET_C = { "Not Due Yet": "#10b981", "1-30 Days": "#f59e0b", "31-60 Days": "#fb7185", ">60 Days": "#ef4444" };

export default function AdminApAging({ apiBase = "" }) {
  const { confirm } = useUiKit();
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/ap-aging`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const saveEdit = async () => {
    const r = await fetch(`${apiBase}/api/ap-aging/${editing.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing),
    });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Disimpan"); setEditing(null); load(); }
    else setMsg(j.error || "gagal");
  };
  const remove = async (item) => {
    const ok = await confirm({ title: `Hapus "${item.invoice_no || item.vendor || '#'+item.id}"?`, message: "Akan dihapus permanen. Tidak bisa dibatalkan.", danger: true, okLabel: "Delete" });
    if (!ok) return;
    const r = await fetch(`${apiBase}/api/ap-aging/${item.id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Dihapus"); load(); }
    else setMsg(j.error || "gagal");
  };
  const pay = (p) => {
    fetch(`${apiBase}/api/ap-aging/${p.id}/pay`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: p.outstanding }),
    }).then(r => r.json()).then(j => { if (j.ok) { setMsg(`✓ ${p.invoice_no} dibayar — ${j.status}`); load(); } else setMsg(j.error || "gagal"); }).catch(e => setMsg(String(e)));
  };

  if (!d) return <LoadingState label="Memuat AP Aging…" sub="Menyusun bucket umur hutang" />;
  const s = d.summary;
  const maxB = Math.max(1, ...d.buckets.map(b => b.total));

  return (
    <div>
      <div style={S.intro}>
        📑 <b style={{ color: "#f87171" }}>AP AGING — HUTANG USAHA</b> — aging report hutang ke vendor
        per bucket umur. Counterpart dari AR, kunci buat cash management.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Hutang" v={fmtRp(s.total_outstanding)} c={AC} />
        <Kpi label="Lewat Jatuh Tempo" v={fmtRp(s.overdue_total)} c={s.overdue_total > 0 ? "#ef4444" : "#10b981"} />
        <Kpi label="Invoice Telat" v={String(s.overdue_count)} c={s.overdue_count > 0 ? "#f59e0b" : "#10b981"} />
        <Kpi label="Quantity Vendor" v={String(s.vendor_count)} c="#3b82f6" />
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>📊 AGING BUCKET</div>
        <div style={{ display: "grid", gap: 9, marginTop: 10 }}>
          {d.buckets.map(b => (
            <div key={b.bucket} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 150, fontSize: 11.5, color: BUCKET_C[b.bucket], fontWeight: 600 }}>{b.bucket}</span>
              <div style={{ flex: 1, height: 16, background: "#0a0e16", borderRadius: 5, overflow: "hidden" }}>
                <div style={{ height: "100%", width: Math.max(b.total / maxB * 100, b.total > 0 ? 3 : 0) + "%", background: BUCKET_C[b.bucket] }} />
              </div>
              <span style={{ width: 110, textAlign: "right", fontSize: 12, fontFamily: "'Geist Mono',monospace", color: "#cdd5df" }}>{fmtJt(b.total)}</span>
              <span style={{ width: 30, textAlign: "right", fontSize: 10, color: "#5b6470" }}>{b.count}×</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🧾 HUTANG VENDOR — {d.payables.length}</div>
        {msg ? <div style={{ fontSize: 12, margin: "8px 0", color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
          <thead>
            <tr style={{ color: "#5b6470", fontSize: 10, textAlign: "left" }}>
              {["VENDOR", "INVOICE", "OUTSTANDING", "JATUH TEMPO", "BUCKET", ""].map(h => <th key={h} style={{ padding: "6px 8px", fontWeight: 600 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {d.payables.map(p => (
              <tr key={p.id} style={{ borderTop: "1px solid #161b22", fontSize: 12 }}>
                <td style={{ ...S.td, color: "#e6edf3", fontWeight: 600 }}>{p.vendor}</td>
                <td style={{ ...S.td, ...S.mono, color: "#5b6470" }}>{p.invoice_no}</td>
                <td style={{ ...S.td, ...S.mono, fontWeight: 700, color: "#cdd5df" }}>{fmtRp(p.outstanding)}</td>
                <td style={{ ...S.td, ...S.mono, color: p.overdue ? "#ef4444" : "#9da7b3" }}>{p.overdue ? `telat ${-p.days_to_due} hr` : `${p.days_to_due} hr lagi`}</td>
                <td style={S.td}><span style={{ fontSize: 9, fontWeight: 700, color: BUCKET_C[p.bucket], fontFamily: "'Geist Mono',monospace" }}>{p.bucket}</span></td>
                <td style={S.td}>
                  <div style={{ display: "flex", gap: 4, alignItems: "center", justifyContent: "flex-end" }}>
                    <button onClick={() => pay(p)} style={S.btn}>Pay</button>
                    <button onClick={() => setEditing({ ...p })} title="Edit" style={{ background: "#f59e0b18", border: "1px solid #f59e0b44", color: "#f59e0b", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>✏️</button>
                    <button onClick={() => remove(p)} title="Delete" style={{ background: "#ef444418", border: "1px solid #ef444444", color: "#ef4444", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>🗑️</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 12, padding: 22, maxWidth: 540, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 14 }}>✏️ Edit — {editing.invoice_no || '#'+editing.id}</div>
            <div style={{ display: "grid", gap: 10 }}>
              <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>VENDOR</div><input value={editing.vendor || ""} onChange={e => setEditing({ ...editing, vendor: e.target.value })} style={modalInp} /></div>
              <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>NO INVOICE</div><input value={editing.invoice_no || ""} onChange={e => setEditing({ ...editing, invoice_no: e.target.value })} style={modalInp} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>JUMLAH</div><input type="number" value={editing.amount || 0} onChange={e => setEditing({ ...editing, amount: Number(e.target.value) })} style={modalInp} /></div>
                <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>DIBAYAR</div><input type="number" value={editing.paid_amount || 0} onChange={e => setEditing({ ...editing, paid_amount: Number(e.target.value) })} style={modalInp} /></div>
              </div>
              <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>STATUS</div>
                <select value={editing.status || "unpaid"} onChange={e => setEditing({ ...editing, status: e.target.value })} style={modalInp}>
                  <option value="unpaid">unpaid</option>
                  <option value="partial">partial</option>
                  <option value="paid">paid</option>
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
      <div style={{ fontSize: 16, fontWeight: 800, color: c, fontFamily: "'Geist Mono',monospace", marginTop: 4 }}>{v}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Geist Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  td: { padding: "7px 8px" },
  mono: { fontFamily: "'Geist Mono',monospace" },
  btn: { background: "#dc2626", color: "#fff", border: "none", borderRadius: 6, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
};
