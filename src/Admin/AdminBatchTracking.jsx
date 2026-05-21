// src/Admin/AdminBatchTracking.jsx
// Batch & Expiry Tracking — FEFO.

import { useState, useEffect, useCallback } from "react";

const AC = "#ca8a04";
const fmtDate = (ts) => ts ? new Date(ts * 1000).toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : "—";
const ST = { fresh: "FRESH", expiring: "MENDEKATI", expired: "KEDALUWARSA" };

export default function AdminBatchTracking({ apiBase = "" }) {
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    fetch(`${apiBase}/api/batch-tracking`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const discard = (b) => {
    fetch(`${apiBase}/api/batch-tracking/${b.id}/discard`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      .then(r => r.json()).then(j => { if (j.ok) { setMsg(`✓ ${b.batch_no} dibuang`); load(); } else setMsg(j.error || "gagal"); }).catch(e => setMsg(String(e)));
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Batch Tracking…</div>;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        📅 <b style={{ color: "#facc15" }}>BATCH & EXPIRY TRACKING</b> — lacak stok per batch + tanggal
        kedaluwarsa. Urutan <b>FEFO</b> (First Expired First Out) + alert mendekati expired.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Batch" v={String(s.total)} c={AC} />
        <Kpi label="Mendekati Expired" v={String(s.expiring)} c={s.expiring > 0 ? "#f59e0b" : "#10b981"} sub="≤ 7 hari" />
        <Kpi label="Sudah Kedaluwarsa" v={String(s.expired)} c={s.expired > 0 ? "#ef4444" : "#10b981"} />
        <Kpi label="Fresh" v={String(s.fresh)} c="#10b981" />
      </div>
      {msg ? <div style={{ fontSize: 12, margin: "8px 2px", color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}

      {d.alerts.length > 0 && (
        <div style={{ ...S.card, marginTop: 14, borderColor: "#f59e0b44" }}>
          <div style={{ ...S.kicker, color: "#f59e0b" }}>⚠️ ALERT — {d.alerts.length} batch perlu tindakan</div>
          <div style={{ fontSize: 12, color: "#9da7b3", marginTop: 6 }}>
            Prioritaskan pemakaian batch yang mendekati expired (FEFO). Batch kedaluwarsa harus dibuang.
          </div>
        </div>
      )}

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>📦 BATCH — URUT FEFO (paling cepat expired di atas)</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
          <thead>
            <tr style={{ color: "#5b6470", fontSize: 10, textAlign: "left" }}>
              {["BATCH", "ITEM", "QTY", "DITERIMA", "EXPIRED", "SISA", "STATUS", ""].map(h => <th key={h} style={{ padding: "6px 8px", fontWeight: 600 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {d.batches.map(b => (
              <tr key={b.id} style={{ borderTop: "1px solid #161b22", fontSize: 12 }}>
                <td style={{ ...S.td, fontFamily: "'Space Mono',monospace", color: "#5b6470" }}>{b.batch_no}</td>
                <td style={{ ...S.td, color: "#e6edf3", fontWeight: 600 }}>{b.item_name} <span style={{ color: "#5b6470", fontFamily: "'Space Mono',monospace", fontSize: 10 }}>{b.sku}</span></td>
                <td style={{ ...S.td, fontFamily: "'Space Mono',monospace", color: "#9da7b3" }}>{b.qty} {b.unit}</td>
                <td style={{ ...S.td, color: "#5b6470" }}>{fmtDate(b.received_at)}</td>
                <td style={{ ...S.td, color: "#9da7b3" }}>{fmtDate(b.expiry_at)}</td>
                <td style={{ ...S.td, fontFamily: "'Space Mono',monospace", fontWeight: 700, color: b.color }}>
                  {b.days < 0 ? `${-b.days} hr lewat` : `${b.days} hari`}
                </td>
                <td style={S.td}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: b.color, background: b.color + "1f", border: `1px solid ${b.color}55`, borderRadius: 5, padding: "2px 7px", fontFamily: "'Space Mono',monospace" }}>{ST[b.status]}</span>
                </td>
                <td style={S.td}>
                  {b.status === "expired" && <button onClick={() => discard(b)} style={S.btn}>🗑 Buang</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, v, c, sub }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Space Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: c, fontFamily: "'Space Mono',monospace", margin: "4px 0 2px" }}>{v}</div>
      <div style={{ fontSize: 10, color: "#5b6470" }}>{sub || " "}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Space Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  td: { padding: "7px 8px" },
  btn: { background: "#ef444420", border: "1px solid #ef444455", color: "#f87171", fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontFamily: "'Space Mono',monospace" },
};
