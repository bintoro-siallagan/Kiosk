// src/Admin/AdminOutletMaster.jsx
// Outlet Master — registry & lifecycle outlet.

import { useState, useEffect, useCallback } from "react";

const AC = "#15803d";
const ST = { active: { c: "#10b981", l: "AKTIF" }, renovation: { c: "#f59e0b", l: "RENOVASI" }, onboarding: { c: "#3b82f6", l: "ONBOARDING" }, closed: { c: "#ef4444", l: "TUTUP" } };
const TYPE_ICON = { "Dine-in": "🍽️", Express: "⚡", Kiosk: "🖥️" };

export default function AdminOutletMaster({ apiBase = "" }) {
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    fetch(`${apiBase}/api/outlet-master`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const cycleStatus = (o) => {
    if (!d) return;
    const next = d.statuses[(d.statuses.indexOf(o.status) + 1) % d.statuses.length];
    fetch(`${apiBase}/api/outlet-master/${o.id}/status`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }),
    }).then(r => r.json()).then(j => { if (j.ok) { setMsg(`✓ ${o.name} → ${next}`); load(); } else setMsg(j.error || "gagal"); }).catch(e => setMsg(String(e)));
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Outlet Master…</div>;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        🏪 <b style={{ color: "#4ade80" }}>OUTLET MASTER</b> — registry &amp; lifecycle outlet: profil, tipe,
        kapasitas &amp; status (aktif / renovasi / onboarding / tutup). Klik badge status buat ubah.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Outlet" v={String(s.total)} c={AC} />
        <Kpi label="Aktif Operasi" v={String(s.active)} c="#10b981" />
        <Kpi label="Non-Operasional" v={String(s.not_operational)} c={s.not_operational > 0 ? "#f59e0b" : "#10b981"} />
        <Kpi label="Total Kapasitas" v={s.total_capacity + " kursi"} c="#3b82f6" />
      </div>
      {msg ? <div style={{ fontSize: 12, margin: "8px 2px", color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={S.kicker}>🏪 REGISTRY OUTLET — {d.outlets.length}</span>
          <span style={{ fontSize: 11, color: "#5b6470" }}>{s.by_type.map(t => `${TYPE_ICON[t.type]} ${t.type} ${t.count}`).join("  ·  ")}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(310px,1fr))", gap: 12, marginTop: 10 }}>
          {d.outlets.map(o => {
            const st = ST[o.status] || ST.active;
            return (
              <div key={o.id} style={{ background: "#0a0e16", border: "1px solid #161b22", borderTop: `2px solid ${st.c}`, borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 18 }}>{TYPE_ICON[o.outlet_type] || "🏪"}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#e6edf3" }}>{o.name}</div>
                    <div style={{ fontSize: 10, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>{o.code} · {o.area}</div>
                  </div>
                  <button onClick={() => cycleStatus(o)} style={{ fontSize: 9, fontWeight: 700, color: st.c, background: st.c + "1f", border: `1px solid ${st.c}66`, borderRadius: 5, padding: "3px 8px", fontFamily: "'Geist Mono',monospace", cursor: "pointer" }}>{st.l}</button>
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: "#9da7b3", lineHeight: 1.7 }}>
                  <div>📍 {o.address}</div>
                  <div>👤 {o.manager} · ☎ {o.phone}</div>
                  <div>🪑 {o.seat_capacity} kursi · <span style={{ color: "#5b6470" }}>{o.outlet_type}</span></div>
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
};
