// src/Admin/AdminDeliveryOrder.jsx
// Delivery Order (Surat Jalan) — pengiriman barang ke customer B2B.

import { useState, useEffect, useCallback } from "react";

const AC = "#0891b2";
const STAT = { draft: { c: "#f59e0b", l: "DRAFT" }, shipped: { c: "#3b82f6", l: "DIKIRIM" }, delivered: { c: "#10b981", l: "DITERIMA" } };
const NEXT = { draft: "📤 Kirim", shipped: "📥 Tandai Sampai" };
const fmtDate = (ts) => ts ? new Date(ts * 1000).toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : "—";

export default function AdminDeliveryOrder({ apiBase = "" }) {
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    fetch(`${apiBase}/api/delivery-order`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const advance = (o) => {
    fetch(`${apiBase}/api/delivery-order/${o.id}/advance`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      .then(r => r.json()).then(j => { if (j.ok) { setMsg(`✓ ${o.do_no} → ${j.status}`); load(); } else setMsg(j.error || "gagal"); }).catch(e => setMsg(String(e)));
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Delivery Order…</div>;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        🚛 <b style={{ color: "#22d3ee" }}>DELIVERY ORDER</b> — surat jalan pengiriman barang ke customer
        B2B atas Sales Order. Flow: draft → dikirim → diterima.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total DO" v={String(s.total)} c={AC} />
        <Kpi label="Draft" v={String(s.draft)} c={s.draft > 0 ? "#f59e0b" : "#10b981"} />
        <Kpi label="Dikirim" v={String(s.shipped)} c="#3b82f6" />
        <Kpi label="Diterima" v={String(s.delivered)} c="#10b981" />
      </div>
      {msg ? <div style={{ fontSize: 12, margin: "8px 2px", color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🚛 DAFTAR SURAT JALAN — {d.orders.length}</div>
        <div style={{ display: "grid", gap: 9, marginTop: 10 }}>
          {d.orders.map(o => {
            const st = STAT[o.status] || STAT.draft;
            return (
              <div key={o.id} style={{ background: "#0a0e16", border: "1px solid #161b22", borderLeft: `3px solid ${st.c}`, borderRadius: 9, padding: "11px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>{o.do_no} <span style={{ color: "#5b6470", fontWeight: 400, fontSize: 11 }}>· {o.customer_name}</span></div>
                    <div style={{ fontSize: 10, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>{o.so_ref} · 🚚 {o.driver}{o.shipped_at ? ` · kirim ${fmtDate(o.shipped_at)}` : ""}</div>
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 700, color: st.c, background: st.c + "1f", border: `1px solid ${st.c}55`, borderRadius: 5, padding: "2px 8px", fontFamily: "'Geist Mono',monospace" }}>{st.l}</span>
                  {NEXT[o.status] && <button onClick={() => advance(o)} style={S.act}>{NEXT[o.status]}</button>}
                </div>
                <div style={{ marginTop: 7, fontSize: 11, color: "#9da7b3" }}>
                  📍 {o.destination} · {o.items.map(i => `${i.name} ${i.qty}${i.unit}`).join(" · ")}
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
  act: { background: "#0891b2", color: "#fff", border: "none", borderRadius: 6, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
};
