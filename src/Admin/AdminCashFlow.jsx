// src/Admin/AdminCashFlow.jsx
// Laporan Arus Kas — Cash Flow Statement.

import { useState, useEffect, useCallback } from "react";

const fmtRp = (n) => (n < 0 ? "−Rp " : "Rp ") + Math.abs(Math.round(n || 0)).toLocaleString("id-ID");
const fmtJt = (n) => (n < 0 ? "−" : "") + (Math.abs(n) / 1e6).toFixed(1) + "M";
const AC = "#0d9488";
const SEC_C = { Operasi: "#10b981", Investasi: "#3b82f6", Pendanaan: "#a855f7" };

export default function AdminCashFlow({ apiBase = "" }) {
  const [d, setD] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/cash-flow`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Laporan Arus Kas…</div>;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        💧 <b style={{ color: "#2dd4bf" }}>LAPORAN ARUS KAS</b> — Cash Flow Statement: arus kas Operasi,
        Investasi &amp; Pendanaan. Pelengkap Neraca &amp; Laba-Rugi · {d.period}.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Arus Kas Operasi" v={fmtJt(s.operating)} c={s.operating >= 0 ? "#10b981" : "#ef4444"} />
        <Kpi label="Arus Kas Investasi" v={fmtJt(s.investing)} c={s.investing >= 0 ? "#10b981" : "#ef4444"} />
        <Kpi label="Arus Kas Pendanaan" v={fmtJt(s.financing)} c={s.financing >= 0 ? "#10b981" : "#ef4444"} />
        <Kpi label="Kas Akhir Periode" v={fmtJt(s.closing_cash)} c={AC} />
      </div>

      {!s.healthy && (
        <div style={{ ...S.card, marginTop: 10, borderColor: "#ef444455", background: "#1a0d0f" }}>
          <div style={{ fontSize: 13, color: "#fca5a5" }}>⚠️ Arus kas operasi negatif — operasional inti belum menghasilkan kas.</div>
        </div>
      )}

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>💧 LAPORAN ARUS KAS — {d.period}</div>
        <div style={{ marginTop: 10 }}>
          {d.sections.map(sec => (
            <div key={sec.section} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: SEC_C[sec.section], fontFamily: "'Geist Mono',monospace", letterSpacing: 0.5, marginBottom: 4 }}>
                AKTIVITAS {sec.section.toUpperCase()}
              </div>
              {sec.lines.map((ln, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0 4px 14px", fontSize: 12 }}>
                  <span style={{ color: "#9da7b3" }}>{ln.label}</span>
                  <span style={{ fontFamily: "'Geist Mono',monospace", color: ln.amount >= 0 ? "#cdd5df" : "#f87171" }}>{fmtRp(ln.amount)}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: "1px solid #21262d", marginTop: 2 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#e6edf3" }}>Kas Bersih dari Aktivitas {sec.section}</span>
                <span style={{ fontSize: 13, fontWeight: 800, fontFamily: "'Geist Mono',monospace", color: sec.subtotal >= 0 ? "#10b981" : "#ef4444" }}>{fmtRp(sec.subtotal)}</span>
              </div>
            </div>
          ))}
          <div style={{ borderTop: "2px solid #21262d", paddingTop: 8 }}>
            <Tot label="Kenaikan / (Penurunan) Kas Bersih" v={d.net_change} />
            <Tot label="Kas Awal Periode" v={d.opening_cash} muted />
            <Tot label="KAS AKHIR PERIODE" v={d.closing_cash} big />
          </div>
        </div>
      </div>
    </div>
  );
}

function Tot({ label, v, big, muted }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0" }}>
      <span style={{ fontSize: big ? 14 : 12, fontWeight: big ? 800 : muted ? 400 : 600, color: big ? "#e6edf3" : muted ? "#9da7b3" : "#cdd5df" }}>{label}</span>
      <span style={{ fontSize: big ? 16 : 13, fontWeight: 800, fontFamily: "'Geist Mono',monospace", color: big ? "#2dd4bf" : v >= 0 ? "#10b981" : "#ef4444" }}>{fmtRp(v)}</span>
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
