// src/Admin/AdminReleasePayment.jsx
// Release Payment — pencairan pembayaran vendor.

import { useState, useEffect, useCallback } from "react";
import { useUiKit , LoadingState} from "../components/uiKit.jsx";

import { fmtMoney as fmtRp } from "../lib/currency.js";
const AC = "#c2410c";
const fmtDate = (ts) => ts ? new Date(ts * 1000).toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : "—";

export default function AdminReleasePayment({ apiBase = "" }) {
  const { confirm } = useUiKit();
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(null);
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/release-payment`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const saveEdit = async () => {
    const r = await fetch(`${apiBase}/api/release-payment/${editing.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing),
    });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Disimpan"); setEditing(null); load(); }
    else setMsg(j.error || "gagal");
  };
  const remove = async (item) => {
    const ok = await confirm({ title: `Hapus "${item.release_no || item.invoice_ref || '#'+item.id}"?`, message: "Akan dihapus permanen. Tidak bisa dibatalkan.", danger: true, okLabel: "Delete" });
    if (!ok) return;
    const r = await fetch(`${apiBase}/api/release-payment/${item.id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Dihapus"); load(); }
    else setMsg(j.error || "gagal");
  };

  const release = (p) => {
    if (busy) return;
    setBusy(p.id); setMsg("");
    fetch(`${apiBase}/api/release-payment/${p.id}/release`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ released_by: "Finance Director", payment_method: p.payment_method }),
    }).then(r => r.json()).then(j => {
      if (j.ok) { setMsg(`✓ ${p.payee} — ${fmtRp(p.amount)} dicairkan`); load(); }
      else setMsg(j.error || "gagal");
    }).catch(e => setMsg(String(e))).finally(() => setBusy(null));
  };

  if (!d) return <LoadingState label="Memuat Release Payment…" />;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        💸 <b style={{ color: "#fb923c" }}>RELEASE PAYMENT</b> — pencairan pembayaran ke vendor atas invoice
        yang sudah disetujui. Step terakhir Account Payable: approve → <b>release</b>.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Pending Release" v={String(s.pending_count)} c={AC} />
        <Kpi label="Total Harus Paid" v={fmtRp(s.pending_total)} c="#f59e0b" />
        <Kpi label="Jatuh Tempo Lewat" v={String(s.overdue)} c={s.overdue > 0 ? "#ef4444" : "#10b981"} />
        <Kpi label="Dicairkan Bln Ini" v={fmtRp(s.released_month)} c="#10b981" />
      </div>
      {msg ? <div style={{ fontSize: 12, margin: "8px 2px", color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}

      {/* Pending */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>⏳ MENUNGGU PENCAIRAN — {d.pending.length}</div>
        {d.pending.length === 0 ? (
          <div style={{ fontSize: 12, color: "#10b981", padding: "10px 0" }}>✓ None pembayaran tertunda.</div>
        ) : (
          <div style={{ display: "grid", gap: 9, marginTop: 10 }}>
            {d.pending.map(p => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, background: "#0a0e16", border: "1px solid #161b22", borderLeft: `3px solid ${p.overdue ? "#ef4444" : "#f59e0b"}`, borderRadius: 9, padding: "11px 14px" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>{p.payee}</div>
                  <div style={{ fontSize: 11, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>{p.release_no} · {p.invoice_ref} · {p.payment_method}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 10, color: p.overdue ? "#ef4444" : "#5b6470" }}>{p.overdue ? "⚠ TELAT — " : "tempo "}{fmtDate(p.due_date)}</div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#fb923c", fontFamily: "'Geist Mono',monospace", width: 140, textAlign: "right" }}>{fmtRp(p.amount)}</div>
                <button onClick={() => release(p)} disabled={busy === p.id} style={S.btn}>
                  {busy === p.id ? "Memproses…" : "💸 Release"}
                </button>
                <button onClick={() => setEditing({ ...p })} title="Edit" style={{ background: "#f59e0b18", border: "1px solid #f59e0b44", color: "#f59e0b", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>✏️</button>
                <button onClick={() => remove(p)} title="Delete" style={{ background: "#ef444418", border: "1px solid #ef444444", color: "#ef4444", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>🗑️</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Released */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>✅ RIWAYAT PENCAIRAN — {d.released.length}</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
          <thead>
            <tr style={{ color: "#5b6470", fontSize: 10, textAlign: "left" }}>
              {["NO", "PAYEE", "INVOICE", "JUMLAH", "METODE", "OLEH", "TGL CAIR"].map(h => <th key={h} style={{ padding: "6px 8px", fontWeight: 600 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {d.released.map(p => (
              <tr key={p.id} style={{ borderTop: "1px solid #161b22", fontSize: 12 }}>
                <td style={{ ...S.td, fontFamily: "'Geist Mono',monospace", color: "#5b6470", fontSize: 10 }}>{p.release_no}</td>
                <td style={{ ...S.td, color: "#e6edf3", fontWeight: 600 }}>{p.payee}</td>
                <td style={{ ...S.td, fontFamily: "'Geist Mono',monospace", color: "#9da7b3" }}>{p.invoice_ref}</td>
                <td style={{ ...S.td, fontFamily: "'Geist Mono',monospace", fontWeight: 700, color: "#10b981" }}>{fmtRp(p.amount)}</td>
                <td style={{ ...S.td, color: "#9da7b3" }}>{p.payment_method}</td>
                <td style={{ ...S.td, color: "#9da7b3" }}>{p.released_by}</td>
                <td style={{ ...S.td, color: "#5b6470" }}>{fmtDate(p.released_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 12, padding: 22, maxWidth: 540, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 14 }}>✏️ Edit — {editing.release_no || '#'+editing.id}</div>
            <div style={{ display: "grid", gap: 10 }}>
              <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>PAYEE</div><input value={editing.payee || ""} onChange={e => setEditing({ ...editing, payee: e.target.value })} style={modalInp} /></div>
              <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>INVOICE REF</div><input value={editing.invoice_ref || ""} onChange={e => setEditing({ ...editing, invoice_ref: e.target.value })} style={modalInp} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>JUMLAH</div><input type="number" value={editing.amount || 0} onChange={e => setEditing({ ...editing, amount: Number(e.target.value) })} style={modalInp} /></div>
                <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>JATUH TEMPO (unix)</div><input type="number" value={editing.due_date || 0} onChange={e => setEditing({ ...editing, due_date: Number(e.target.value) })} style={modalInp} /></div>
              </div>
              <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>METODE</div>
                <select value={editing.payment_method || "Transfer Bank"} onChange={e => setEditing({ ...editing, payment_method: e.target.value })} style={modalInp}>
                  <option value="Transfer Bank">Transfer Bank</option>
                  <option value="Cash">Cash</option>
                  <option value="Cek / Giro">Cek / Giro</option>
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
  td: { padding: "8px 8px" },
  btn: { background: "#c2410c", color: "#fff", border: "none", borderRadius: 7, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
};
