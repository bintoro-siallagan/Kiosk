// karyaOS — Cinema Ticket Validator (door scanner)
// Scan a QR (or paste/type the code) and Enter → validate.
// Works with any USB QR/barcode scanner that acts as a keyboard.
import { useState, useEffect, useRef } from "react";

export default function CinemaValidate({ apiBase = "" }) {
  const base = (apiBase || "") + "/api/cinema";
  const [code, setCode] = useState("");
  const [last, setLast] = useState(null);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function validate(theCode) {
    const c = (theCode || "").trim();
    if (!c || busy) return;
    setBusy(true);
    let entry;
    try {
      const r = await fetch(`${base}/tickets/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: c }),
      });
      const d = await r.json();
      entry = { ...d, code: c, t: Date.now() };
    } catch (e) {
      entry = { ok: false, status: "error", error: e.message, code: c, t: Date.now() };
    }
    setLast(entry);
    setHistory(prev => [entry, ...prev].slice(0, 10));
    setBusy(false);
    setCode("");
    setTimeout(() => inputRef.current?.focus(), 80);
  }

  const onKey = (e) => { if (e.key === "Enter") validate(code); };

  const status = last?.status || "";
  const color =
    status === "valid" ? "#10b981" :
    status === "used"  ? "#f59e0b" : "#ef4444";
  const icon =
    status === "valid" ? "✅" :
    status === "used"  ? "⚠️" : "❌";
  const label =
    status === "valid" ? "VALID" :
    status === "used"  ? "SUDAH DIPAKAI" : "TIDAK VALID";
  const ticket = last?.ticket;

  return (
    <div style={S.root}>
      <h2 style={S.title}>🎟️ Validasi Tiket Cinema</h2>
      <p style={S.sub}>Scan QR atau ketik kode tiket, lalu tekan Enter. Cocok untuk scanner USB tipe keyboard-wedge.</p>

      <input
        ref={inputRef}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={onKey}
        placeholder="CT-XXXXXXXX"
        style={S.input}
        autoFocus
        disabled={busy}
      />

      {last && (
        <div style={{ ...S.card, borderColor: color, boxShadow: `0 0 32px ${color}55` }}>
          <div style={{ fontSize: 84, lineHeight: 1, marginBottom: 8 }}>{icon}</div>
          <div style={{ fontSize: 28, fontWeight: 800, color, letterSpacing: 2 }}>{label}</div>
          <div style={S.codePill}>{last.code}</div>
          {ticket && (
            <div style={S.ticketBox}>
              <Row k="Film"    v={ticket.film_title || "—"} />
              <Row k="Studio"  v={ticket.studio_name || "—"} />
              <Row k="Jadwal"  v={`${ticket.show_date || "—"} · ${ticket.show_time || ""}`} />
              <Row k="Kursi"   v={<b style={{ fontSize: 18 }}>{ticket.seat}</b>} />
              {status === "used" && (
                <Row k="Dipakai" v={<b style={{ color: "#f59e0b" }}>{new Date((last.usedAt || ticket.checked_in_at) * 1000).toLocaleString("id-ID")}</b>} />
              )}
              {last.bundles?.length > 0 && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed #1f2937" }}>
                  <div style={{ fontSize: 10, color: "#fbbf24", letterSpacing: 2, fontFamily: "'Geist Mono',monospace", marginBottom: 4 }}>🍿 F&amp;B COMBO (di-redeem di counter)</div>
                  {last.bundles.map(b => (
                    <div key={b.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "3px 0" }}>
                      <span><b style={{ color: "#fbbf24" }}>{b.qty}×</b> {b.bundle_name}</span>
                      <span style={{ color: b.redeemed_at ? "#10b981" : "#9ca3af" }}>{b.redeemed_at ? "✓ sudah" : "belum"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {!ticket && last.error && (
            <div style={{ fontSize: 14, color: "#ef4444", marginTop: 12 }}>{last.error}</div>
          )}
        </div>
      )}

      {history.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={S.histTitle}>Riwayat Validasi (10 terakhir)</div>
          {history.map((h, i) => {
            const c = h.status === "valid" ? "#10b981" : h.status === "used" ? "#f59e0b" : "#ef4444";
            const lbl = h.status === "valid" ? "✓ valid" : h.status === "used" ? "⚠ sudah dipakai" : "✕ invalid";
            return (
              <div key={i} style={{ ...S.histRow, color: c }}>
                <span style={{ fontFamily: "'Geist Mono',monospace", letterSpacing: 1 }}>{h.code}</span>
                <span style={{ flex: 1 }}>{h.ticket?.film_title ? `· ${h.ticket.film_title} · kursi ${h.ticket.seat}` : ""}</span>
                <span>{lbl}</span>
                <span style={{ color: "#666", fontSize: 11 }}>{new Date(h.t).toLocaleTimeString("id-ID")}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #1f2937" }}>
      <span style={{ color: "#9ca3af" }}>{k}</span>
      <span>{v}</span>
    </div>
  );
}

const S = {
  root:      { padding: 24, color: "#fafafa", maxWidth: 720, margin: "0 auto" },
  title:     { margin: "0 0 4px", fontSize: 24, fontWeight: 800 },
  sub:       { margin: "0 0 22px", color: "#9ca3af", fontSize: 13, lineHeight: 1.5 },
  input:     { width: "100%", padding: "16px 18px", fontSize: 18, fontFamily: "'Geist Mono',monospace", letterSpacing: 3, background: "#0d1117", border: "1px solid #2a2a2a", borderRadius: 12, color: "#fff", outline: "none", boxSizing: "border-box" },
  card:      { marginTop: 22, padding: 26, borderRadius: 16, border: "2px solid", background: "#0d1117", textAlign: "center", transition: "all 0.2s" },
  codePill:  { display: "inline-block", marginTop: 8, padding: "4px 12px", background: "rgba(255,255,255,0.04)", borderRadius: 8, fontFamily: "'Geist Mono',monospace", fontSize: 13, color: "#aaa", letterSpacing: 2 },
  ticketBox: { marginTop: 18, textAlign: "left", background: "#161b22", borderRadius: 12, padding: "12px 16px", fontSize: 14 },
  histTitle: { fontSize: 12, color: "#9ca3af", letterSpacing: 2, marginBottom: 10 },
  histRow:   { display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 14, alignItems: "center", padding: "8px 14px", background: "#0d1117", border: "1px solid #1b212c", borderRadius: 8, marginBottom: 4, fontSize: 13 },
};
