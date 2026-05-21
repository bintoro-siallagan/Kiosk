// src/Admin/AdminPeriodClosing.jsx
// Period Closing — tutup periode akuntansi & stok.

import { useState, useEffect, useCallback } from "react";

const AC = "#475569";
const fmtDate = (ts) => ts ? new Date(ts * 1000).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—";

export default function AdminPeriodClosing({ apiBase = "" }) {
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    fetch(`${apiBase}/api/period-closing`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const post = (path, body, okMsg) => {
    fetch(`${apiBase}/api/period-closing/${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
    }).then(r => r.json()).then(j => { if (j.ok) { setMsg(okMsg); load(); } else setMsg(j.error || "gagal"); }).catch(e => setMsg(String(e)));
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Period Closing…</div>;
  const s = d.summary;

  const Section = ({ title, icon, list }) => (
    <div style={{ ...S.card, marginTop: 14 }}>
      <div style={S.kicker}>{icon} {title}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(330px,1fr))", gap: 12, marginTop: 10 }}>
        {list.map(pr => {
          const closed = pr.status === "closed";
          const ready = pr.done_count === pr.total;
          return (
            <div key={pr.id} style={{ background: "#0a0e16", border: "1px solid #161b22", borderTop: `2px solid ${closed ? "#10b981" : ready ? "#f59e0b" : "#475569"}`, borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#e6edf3" }}>{pr.period_name}</span>
                <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "'Space Mono',monospace", color: closed ? "#10b981" : "#f59e0b" }}>
                  {closed ? "🔒 CLOSED" : `${pr.done_count}/${pr.total}`}
                </span>
              </div>
              <div style={{ margin: "9px 0" }}>
                {pr.checklist.map((c, i) => (
                  <div key={i} onClick={() => !closed && post(`${pr.id}/check`, { index: i }, "✓ Checklist diperbarui")}
                    style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, padding: "3px 0", color: c.done ? "#cdd5df" : "#5b6470", cursor: closed ? "default" : "pointer" }}>
                    <span style={{ color: c.done ? "#10b981" : "#5b6470" }}>{c.done ? "☑" : "☐"}</span>
                    <span style={{ textDecoration: c.done ? "none" : "none" }}>{c.label}</span>
                  </div>
                ))}
              </div>
              {closed ? (
                <div style={{ fontSize: 10, color: "#5b6470" }}>Ditutup {pr.closed_by} · {fmtDate(pr.closed_at)}</div>
              ) : (
                <button onClick={() => post(`${pr.id}/close`, { closed_by: "Finance Director" }, `✓ ${pr.period_name} ditutup`)}
                  disabled={!ready} style={{ ...S.btn, opacity: ready ? 1 : 0.4, cursor: ready ? "pointer" : "not-allowed" }}>
                  {ready ? "🔒 Tutup Periode" : "Checklist belum lengkap"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div>
      <div style={S.intro}>
        🔒 <b style={{ color: "#94a3b8" }}>PERIOD CLOSING</b> — tutup periode akuntansi &amp; periode stok.
        Lengkapi checklist pra-tutup → periode dikunci &amp; tidak bisa diubah.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Periode Terbuka" v={String(s.open)} c="#f59e0b" />
        <Kpi label="Siap Ditutup" v={String(s.ready)} c={s.ready > 0 ? "#10b981" : "#5b6470"} />
        <Kpi label="Sudah Ditutup" v={String(s.closed)} c="#10b981" />
        <Kpi label="Total Periode" v={String(s.open + s.closed)} c={AC} />
      </div>
      {msg ? <div style={{ fontSize: 12, margin: "8px 2px", color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}

      <Section title="PERIODE AKUNTANSI" icon="📊" list={d.accounting} />
      <Section title="PERIODE STOK" icon="📦" list={d.stock} />
    </div>
  );
}

function Kpi({ label, v, c }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Space Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: c, fontFamily: "'Space Mono',monospace", marginTop: 4 }}>{v}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Space Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  btn: { width: "100%", background: "#475569", color: "#fff", border: "none", borderRadius: 7, padding: "8px", fontSize: 12, fontWeight: 700, fontFamily: "inherit" },
};
