// src/Admin/AdminFinancialStatements.jsx
// Laporan Keuangan — Laba Rugi & Neraca, di-derive dari transaksi
// (lanjutan Jurnal → Buku Besar).

import { useState, useEffect, useCallback } from "react";
import PeriodPicker from "./PeriodPicker.jsx";

const fmtRp = (n) => {
  const v = Math.round(Math.abs(n || 0)).toLocaleString("id-ID");
  return n < 0 ? `(Rp ${v})` : `Rp ${v}`;
};

export default function AdminFinancialStatements({ apiBase = "" }) {
  const [range, setRange] = useState(() => {
    const t = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
    return { from: t - 30 * 86400, to: Math.floor(Date.now() / 1000) };
  });
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    if (!range) return;
    setD(null); setErr("");
    fetch(`${apiBase}/api/financial-statements?from=${range.from}&to=${range.to}`)
      .then(r => r.json()).then(j => j && j.laba_rugi ? setD(j) : setErr("data tidak tersedia"))
      .catch(e => setErr(String(e)));
  }, [apiBase, range]);
  useEffect(() => { load(); }, [load]);

  if (err) return <div style={{ padding: 30, color: "#f87171" }}>Gagal memuat: {err}</div>;
  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat laporan keuangan…</div>;
  const lr = d.laba_rugi, n = d.neraca;

  return (
    <div>
      <div style={S.intro}>
        📊 <b style={{ color: "#10b981" }}>LAPORAN KEUANGAN</b> — Laba Rugi &amp; Neraca, di-derive dari
        transaksi (Jurnal → Buku Besar). HPP masih estimasi (food cost real-time = modul tersendiri).
      </div>

      <PeriodPicker onChange={setRange} defaultPreset="30d" />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {/* LABA RUGI */}
        <div style={S.card}>
          <div style={S.kicker}>📈 LABA RUGI</div>
          <div style={{ marginTop: 8 }}>
            {lr.rows.map((r, i) => (
              <div key={i} style={S.row}>
                <span style={{ color: r.type === "revenue" ? "#e6edf3" : "#9da7b3", fontWeight: r.type === "revenue" ? 600 : 400 }}>{r.label}</span>
                <span style={{ ...S.mono, color: r.amount < 0 ? "#f87171" : "#10b981" }}>{fmtRp(r.amount)}</span>
              </div>
            ))}
            <div style={{ ...S.row, borderTop: "1px solid #21262d", marginTop: 4, paddingTop: 8 }}>
              <span style={{ color: "#9da7b3" }}>Total Beban</span>
              <span style={{ ...S.mono, color: "#f87171" }}>{fmtRp(-lr.total_beban)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0a0e16", borderRadius: 8, padding: "11px 12px", marginTop: 8 }}>
              <span style={{ fontWeight: 800, color: "#fff" }}>LABA BERSIH</span>
              <span style={{ ...S.mono, fontWeight: 800, fontSize: 17, color: lr.laba_bersih >= 0 ? "#10b981" : "#f87171" }}>{fmtRp(lr.laba_bersih)}</span>
            </div>
            <div style={{ textAlign: "right", fontSize: 12, color: "#9da7b3", marginTop: 7 }}>
              Net margin <b style={{ color: lr.margin_pct >= 10 ? "#10b981" : "#f59e0b" }}>{lr.margin_pct}%</b>
            </div>
          </div>
        </div>

        {/* NERACA */}
        <div style={S.card}>
          <div style={S.kicker}>⚖️ NERACA {n.balanced
            ? <span style={{ color: "#10b981" }}>· ✓ BALANCE</span>
            : <span style={{ color: "#f87171" }}>· ✗ TIDAK BALANCE</span>}</div>
          <div style={{ marginTop: 8 }}>
            <div style={S.grpLbl}>ASET</div>
            {n.aset.map((a, i) => (
              <div key={i} style={S.row}><span style={{ color: "#9da7b3" }}>{a.label}</span><span style={S.mono}>{fmtRp(a.amount)}</span></div>
            ))}
            <div style={{ ...S.row, borderTop: "1px solid #21262d", paddingTop: 6 }}>
              <span style={{ fontWeight: 700, color: "#e6edf3" }}>TOTAL ASET</span>
              <span style={{ ...S.mono, fontWeight: 700, color: "#3b82f6" }}>{fmtRp(n.total_aset)}</span>
            </div>
            <div style={{ ...S.grpLbl, marginTop: 12 }}>KEWAJIBAN + EKUITAS</div>
            {[...n.kewajiban, ...n.ekuitas].map((x, i) => (
              <div key={i} style={S.row}><span style={{ color: "#9da7b3" }}>{x.label}</span><span style={S.mono}>{fmtRp(x.amount)}</span></div>
            ))}
            <div style={{ ...S.row, borderTop: "1px solid #21262d", paddingTop: 6 }}>
              <span style={{ fontWeight: 700, color: "#e6edf3" }}>TOTAL PASIVA</span>
              <span style={{ ...S.mono, fontWeight: 700, color: "#3b82f6" }}>{fmtRp(n.total_pasiva)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Geist Mono',monospace" },
  row: { display: "flex", justifyContent: "space-between", padding: "6px 2px", fontSize: 13 },
  mono: { fontFamily: "'Geist Mono',monospace", color: "#cdd5df" },
  grpLbl: { fontSize: 10, color: "#5b6470", fontFamily: "'Geist Mono',monospace", letterSpacing: 1, marginBottom: 3 },
  pill: { background: "#0d1117", border: "1px solid #21262d", color: "#9da7b3", fontSize: 12, padding: "7px 14px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit" },
  pillOn: { background: "#10b981", border: "1px solid #10b981", color: "#04130d", fontSize: 12, fontWeight: 700, padding: "7px 14px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit" },
};
