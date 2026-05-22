// src/Admin/AdminProduction.jsx
// Production / Central Kitchen — production order.

import { useState, useEffect, useCallback } from "react";

const AC = "#9a3412";
const ST = { planned: { c: "#3b82f6", l: "PLANNED" }, in_progress: { c: "#f59e0b", l: "IN PROGRESS" }, completed: { c: "#10b981", l: "COMPLETED" } };
const fmtDate = (ts) => ts ? new Date(ts * 1000).toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : "—";

export default function AdminProduction({ apiBase = "" }) {
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    fetch(`${apiBase}/api/production`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const act = (o, path, okMsg) => {
    fetch(`${apiBase}/api/production/${o.id}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      .then(r => r.json()).then(j => { if (j.ok) { setMsg(okMsg(j)); load(); } else setMsg(j.error || "gagal"); }).catch(e => setMsg(String(e)));
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Production…</div>;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        🏭 <b style={{ color: "#fb923c" }}>PRODUCTION / CENTRAL KITCHEN</b> — production order untuk semi-
        finished &amp; finished goods. Selesai → bahan baku otomatis terkonsumsi dari gudang.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Order" v={String(s.total)} c={AC} />
        <Kpi label="Planned" v={String(s.planned)} c="#3b82f6" />
        <Kpi label="In Progress" v={String(s.in_progress)} c="#f59e0b" />
        <Kpi label="Output Selesai" v={s.output_completed + " unit"} c="#10b981" />
      </div>
      {msg ? <div style={{ fontSize: 12, margin: "8px 2px", color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🍳 PRODUCTION ORDER — {d.orders.length}</div>
        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          {d.orders.map(o => {
            const st = ST[o.status] || ST.planned;
            return (
              <div key={o.id} style={{ background: "#0a0e16", border: "1px solid #161b22", borderLeft: `3px solid ${st.c}`, borderRadius: 9, padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>
                      {o.product_name} <span style={{ color: "#fb923c", fontFamily: "'Geist Mono',monospace" }}>· {o.output_qty} {o.output_unit}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>
                      {o.order_no}{o.completed_at ? ` · selesai ${fmtDate(o.completed_at)}` : ""}{o.produced_by ? ` · ${o.produced_by}` : ""}
                    </div>
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 700, color: st.c, background: st.c + "1f", border: `1px solid ${st.c}55`, borderRadius: 5, padding: "3px 9px", fontFamily: "'Geist Mono',monospace" }}>{st.l}</span>
                  {o.status === "planned" && <button onClick={() => act(o, "start", () => `✓ ${o.product_name} dimulai`)} style={S.btn("#f59e0b")}>▶ Mulai</button>}
                  {o.status === "in_progress" && <button onClick={() => act(o, "complete", j => `✓ Produksi selesai — ${j.materials_consumed} bahan terkonsumsi`)} style={S.btn("#10b981")}>✓ Selesai</button>}
                </div>
                <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>BAHAN:</span>
                  {o.materials.map((m, i) => (
                    <span key={i} style={{ fontSize: 11, color: "#9da7b3", background: "#0d1117", border: "1px solid #161b22", borderRadius: 5, padding: "2px 8px" }}>
                      {m.name} <b style={{ color: "#cdd5df", fontFamily: "'Geist Mono',monospace" }}>{m.qty} {m.unit}</b>
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
  btn: (c) => ({ background: c, color: "#0a0e16", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }),
};
