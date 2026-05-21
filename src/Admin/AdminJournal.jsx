// src/Admin/AdminJournal.jsx
// Jurnal Akuntansi — entri double-entry auto-generate dari transaksi.
// Jurnal Umum + Buku Besar ringkas. Tiap entri balance (D = K).

import { useState, useEffect, useCallback } from "react";
import ReportActions from "./ReportActions.jsx";
import PeriodPicker from "./PeriodPicker.jsx";

const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");

export default function AdminJournal({ apiBase = "" }) {
  const [range, setRange] = useState(() => {
    const t = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
    return { from: t - 30 * 86400, to: Math.floor(Date.now() / 1000) };
  });
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    if (!range) return;
    setD(null); setErr("");
    fetch(`${apiBase}/api/journal?from=${range.from}&to=${range.to}`)
      .then(r => r.json()).then(j => j && j.totals ? setD(j) : setErr("data tidak tersedia"))
      .catch(e => setErr(String(e)));
  }, [apiBase, range]);
  useEffect(() => { load(); }, [load]);

  if (err) return <div style={{ padding: 30, color: "#f87171" }}>Gagal memuat: {err}</div>;
  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat jurnal…</div>;
  const t = d.totals;

  return (
    <div>
      <div style={S.intro}>
        📓 <b style={{ color: "#a78bfa" }}>JURNAL AKUNTANSI</b> — entri double-entry di-generate otomatis dari
        transaksi: penjualan (settlement POS + platform) &amp; beban. Tiap entri <b>balance</b> — total Debit = total Kredit.
      </div>

      <PeriodPicker onChange={setRange} defaultPreset="30d" />

      <ReportActions title="Jurnal Akuntansi" subtitle="Jurnal umum — entri double-entry"
        columns={["Ref", "Deskripsi", "Akun", "Debit", "Kredit"]}
        rows={d.entries.flatMap(e => e.lines.map(l => [e.ref, e.description, l.account, l.debit || "", l.credit || ""]))} />

      <div style={{ ...S.card, marginBottom: 14, borderColor: t.balanced ? "#10b98155" : "#ef444455", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: t.balanced ? "#10b981" : "#ef4444" }}>
          {t.balanced ? "✓ JURNAL BALANCE" : "✗ TIDAK BALANCE"}
        </span>
        <span style={{ fontSize: 13, color: "#9da7b3" }}>
          Total Debit <b style={{ color: "#e6edf3", fontFamily: "'Space Mono',monospace" }}>{fmtRp(t.debit)}</b>
          {"  =  "}Total Kredit <b style={{ color: "#e6edf3", fontFamily: "'Space Mono',monospace" }}>{fmtRp(t.credit)}</b>
        </span>
      </div>

      <div style={S.card}>
        <div style={S.kicker}>📓 JURNAL UMUM — {d.entries.length} ENTRI</div>
        {d.entries.length === 0 ? (
          <div style={{ color: "#5b6470", fontSize: 13, padding: "12px 0" }}>Belum ada transaksi di periode ini.</div>
        ) : d.entries.map((e, i) => (
          <div key={i} style={{ borderTop: "1px solid #161b22", padding: "10px 0" }}>
            <div style={{ fontSize: 12, color: "#e6edf3", fontWeight: 600 }}>
              <span style={{ color: "#a78bfa", fontFamily: "'Space Mono',monospace" }}>{e.ref}</span> · {e.description}
            </div>
            <table style={{ width: "100%", marginTop: 5, borderCollapse: "collapse" }}>
              <tbody>
                {[...e.lines].sort((a, b) => (b.debit - a.debit)).map((l, j) => (
                  <tr key={j} style={{ fontSize: 13 }}>
                    <td style={{ padding: "3px 8px", color: "#cdd5df", paddingLeft: l.credit > 0 ? 34 : 14 }}>{l.account}</td>
                    <td style={{ padding: "3px 8px", textAlign: "right", fontFamily: "'Space Mono',monospace", color: "#10b981", width: 150 }}>{l.debit > 0 ? fmtRp(l.debit) : ""}</td>
                    <td style={{ padding: "3px 8px", textAlign: "right", fontFamily: "'Space Mono',monospace", color: "#f59e0b", width: 150 }}>{l.credit > 0 ? fmtRp(l.credit) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>📚 BUKU BESAR — RINGKAS</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
          <thead>
            <tr style={{ color: "#5b6470", fontSize: 10, textAlign: "left" }}>
              {["AKUN", "DEBIT", "KREDIT", "SALDO"].map(h => <th key={h} style={{ padding: "6px 8px", fontWeight: 600 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {d.ledger.map((l, i) => (
              <tr key={i} style={{ borderTop: "1px solid #161b22", fontSize: 13 }}>
                <td style={{ padding: "8px", color: "#e6edf3", fontWeight: 600 }}>{l.account}</td>
                <td style={{ padding: "8px", textAlign: "right", fontFamily: "'Space Mono',monospace", color: "#9da7b3" }}>{l.debit > 0 ? fmtRp(l.debit) : "—"}</td>
                <td style={{ padding: "8px", textAlign: "right", fontFamily: "'Space Mono',monospace", color: "#9da7b3" }}>{l.credit > 0 ? fmtRp(l.credit) : "—"}</td>
                <td style={{ padding: "8px", textAlign: "right", fontFamily: "'Space Mono',monospace", fontWeight: 700, color: l.balance >= 0 ? "#10b981" : "#f59e0b" }}>
                  {fmtRp(Math.abs(l.balance))} {l.balance >= 0 ? "D" : "K"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Space Mono',monospace" },
  pill: { background: "#0d1117", border: "1px solid #21262d", color: "#9da7b3", fontSize: 12, padding: "7px 14px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit" },
  pillOn: { background: "#a78bfa", border: "1px solid #a78bfa", color: "#140a2e", fontSize: 12, fontWeight: 700, padding: "7px 14px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit" },
};
