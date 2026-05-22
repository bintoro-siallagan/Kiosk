// src/Admin/AdminStockTransfer.jsx
// Stock Transfer — transfer stok antar lokasi.

import { useState, useEffect, useCallback } from "react";

const AC = "#2563eb";
const ST = { requested: { c: "#f59e0b", l: "DIMINTA" }, in_transit: { c: "#3b82f6", l: "DIKIRIM" }, received: { c: "#10b981", l: "DITERIMA" } };
const fmtDate = (ts) => ts ? new Date(ts * 1000).toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : "—";

export default function AdminStockTransfer({ apiBase = "" }) {
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    fetch(`${apiBase}/api/stock-transfer`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const act = (t, path, okMsg) => {
    fetch(`${apiBase}/api/stock-transfer/${t.id}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      .then(r => r.json()).then(j => { if (j.ok) { setMsg(okMsg); load(); } else setMsg(j.error || "gagal"); }).catch(e => setMsg(String(e)));
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Stock Transfer…</div>;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        🔄 <b style={{ color: "#60a5fa" }}>STOCK TRANSFER</b> — transfer stok antar lokasi (gudang pusat ↔
        outlet, outlet ↔ outlet). Workflow: diminta → dikirim → diterima.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Transfer" v={String(s.total)} c={AC} />
        <Kpi label="Diminta" v={String(s.requested)} c="#f59e0b" />
        <Kpi label="Dikirim" v={String(s.in_transit)} c="#3b82f6" />
        <Kpi label="Diterima" v={String(s.received)} c="#10b981" />
      </div>
      {msg ? <div style={{ fontSize: 12, margin: "8px 2px", color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🔄 DAFTAR TRANSFER — {d.transfers.length}</div>
        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          {d.transfers.map(t => {
            const st = ST[t.status] || ST.requested;
            return (
              <div key={t.id} style={{ background: "#0a0e16", border: "1px solid #161b22", borderLeft: `3px solid ${st.c}`, borderRadius: 9, padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>
                      {t.from_location} <span style={{ color: "#60a5fa" }}>→</span> {t.to_location}
                    </div>
                    <div style={{ fontSize: 11, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>
                      {t.transfer_no}{t.sent_at ? ` · kirim ${fmtDate(t.sent_at)}` : ""}{t.received_at ? ` · terima ${fmtDate(t.received_at)}` : ""}
                    </div>
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 700, color: st.c, background: st.c + "1f", border: `1px solid ${st.c}55`, borderRadius: 5, padding: "3px 9px", fontFamily: "'Geist Mono',monospace" }}>{st.l}</span>
                  {t.status === "requested" && <button onClick={() => act(t, "send", `✓ ${t.transfer_no} dikirim`)} style={S.btn("#3b82f6")}>📤 Kirim</button>}
                  {t.status === "in_transit" && <button onClick={() => act(t, "receive", `✓ ${t.transfer_no} diterima`)} style={S.btn("#10b981")}>📥 Terima</button>}
                </div>
                <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {t.items.map((it, i) => (
                    <span key={i} style={{ fontSize: 11, color: "#9da7b3", background: "#0d1117", border: "1px solid #161b22", borderRadius: 5, padding: "2px 8px" }}>
                      {it.name} <b style={{ color: "#cdd5df", fontFamily: "'Geist Mono',monospace" }}>{it.qty} {it.unit}</b>
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
  btn: (c) => ({ background: c, color: "#fff", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }),
};
