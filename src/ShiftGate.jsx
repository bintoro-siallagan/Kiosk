import { useState, useEffect, useCallback } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3011";

export default function ShiftGate({ children, cashier }) {
  const [shift, setShift]   = useState(undefined); // undefined=loading, null=closed, obj=active
  const [dayState, setDay]  = useState(null);      // { closed, closedAt, closedBy }
  const [busy, setBusy]     = useState(false);
  const [err, setErr]       = useState("");
  const [step, setStep]     = useState(null);       // null | "day" | "shift"
  const [openingCash, setOpeningCash] = useState("0");

  const check = useCallback(async () => {
    try {
      const [s, d] = await Promise.all([
        fetch(`${API_BASE}/api/shifts/active`).then(r => r.json()).catch(() => null),
        fetch(`${API_BASE}/api/day/status`).then(r => r.json()).catch(() => ({ closed: false })),
      ]);
      setDay(d || { closed: false });
      setShift((s && s.id) ? s : null);
    } catch (e) {
      console.warn("[ShiftGate] check failed:", e);
      setShift(null);
    }
  }, []);

  useEffect(() => { check(); const id = setInterval(check, 20000); return () => clearInterval(id); }, [check]);

  const openDay = async () => {
    setBusy(true); setErr("");
    try {
      const r = await fetch(`${API_BASE}/api/day/open`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ by: cashier?.name || "Manager" }),
      });
      if (!r.ok) throw new Error("Gagal buka hari");
      await check();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const openShift = async () => {
    setBusy(true); setErr("");
    try {
      const r = await fetch(`${API_BASE}/api/shifts/open`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kasirName: cashier?.name || "Kasir",
          openingCash: parseInt(openingCash, 10) || 0,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Gagal buka shift");
      setStep(null);
      await check();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  if (shift === undefined) return <div style={S.loading}>☕ Memuat…</div>;
  // Day closed → show Buka Hari
  if (dayState?.closed) {
    return (
      <div style={S.overlay}>
        <div style={S.icon}>🌙</div>
        <h1 style={S.title}>HARI SUDAH DITUTUP</h1>
        <p style={S.subtitle}>
          {dayState.closedBy ? `Ditutup oleh ${dayState.closedBy}` : "Business day sudah closed."}
          <br/>Manager harus membuka hari sebelum kasir bisa start day.
        </p>
        {err && <div style={S.err}>⚠ {err}</div>}
        <button onClick={openDay} disabled={busy} style={S.btnPrimary}>{busy ? "⏳ Membuka…" : "🌅 Buka Hari"}</button>
        <div style={S.hint}>Auto-check setiap 20 detik · <span style={{ color: "#aaa", cursor: "pointer" }} onClick={check}>refresh manual</span></div>
      </div>
    );
  }
  // Day open but no active shift → show Start Day / Open Shift
  if (shift === null) {
    // Idle state — big icon + title + CTA
    if (step !== "shift") {
      return (
        <div style={S.overlay}>
          <div style={S.icon}>☕</div>
          <h1 style={S.title}>BELUM SIAP MELAYANI</h1>
          <p style={S.subtitle}>
            Kasir <b style={{ color: "#fff" }}>{cashier?.name || "—"}</b> belum membuka shift hari ini.<br/>
            Klik tombol di bawah untuk mulai operasional outlet.
          </p>
          {err && <div style={S.err}>⚠ {err}</div>}
          <button onClick={() => setStep("shift")} style={S.btnPrimary}>🚀 START DAY · BUKA SHIFT</button>
          <div style={S.hint}>Auto-check setiap 20 detik · <span style={{ color: "#aaa", cursor: "pointer" }} onClick={check}>refresh manual</span></div>
        </div>
      );
    }
    // Form state — compact header + form card (no giant icon stacking)
    return (
      <div style={S.overlay}>
        <div style={S.formCard}>
          <div style={S.formCompactHeader}>
            <span style={{ fontSize: 38, lineHeight: 1, filter: "drop-shadow(0 0 16px rgba(245,158,11,0.35))" }}>☕</span>
            <div style={{ textAlign: "left" }}>
              <div style={S.formTitle}>MULAI SHIFT</div>
              <div style={S.formSubtitle}>Buka kas laci untuk awal operasional</div>
            </div>
          </div>
          <div style={S.formRow}>
            <label style={S.label}>KASIR</label>
            <div style={S.value}>{cashier?.name || "—"}</div>
          </div>
          <div style={S.formRow}>
            <label style={S.label}>OPENING CASH (KAS AWAL)</label>
            <input
              type="number"
              value={openingCash}
              onChange={e => setOpeningCash(e.target.value)}
              placeholder="Misal: 200000"
              autoFocus
              style={S.input}
            />
            <div style={S.hintSm}>Modal awal kas laci untuk kembalian. Contoh: Rp 200.000</div>
          </div>
          {err && <div style={S.err}>⚠ {err}</div>}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
            <button onClick={() => { setStep(null); setErr(""); }} disabled={busy} style={S.btnGhost}>← Batal</button>
            <button onClick={openShift} disabled={busy} style={S.btnPrimary}>{busy ? "⏳ Membuka…" : "✓ MULAI SHIFT"}</button>
          </div>
        </div>
      </div>
    );
  }
  return children;
}

const S = {
  loading: { position: "fixed", inset: 0, background: "#111", color: "#666", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter',sans-serif", fontSize: 14 },
  overlay: { position: "fixed", inset: 0, background: "linear-gradient(160deg,#0a0b0e 0%,#111317 100%)", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Inter',sans-serif", padding: "40px", textAlign: "center", zIndex: 9999 },
  icon: { fontSize: 100, marginBottom: 16, opacity: 0.85, filter: "drop-shadow(0 0 20px rgba(245,158,11,0.3))" },
  title: { fontFamily: "'Inter',sans-serif", fontSize: 44, letterSpacing: 3, margin: "0 0 8px", color: "#F59E0B", fontWeight: 800 },
  subtitle: { fontSize: 18, color: "#aaa", marginTop: 12, maxWidth: 540, lineHeight: 1.5 },
  btnPrimary: { marginTop: 28, background: "linear-gradient(135deg,#F59E0B,#fbbf24)", color: "#1a1205", border: "none", borderRadius: 14, padding: "18px 38px", fontFamily: "'Inter',sans-serif", fontSize: 17, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 32px rgba(245,158,11,0.45)", letterSpacing: 1 },
  btnGhost: { background: "#1a1b1e", color: "#aaa", border: "1px solid #30363d", borderRadius: 12, padding: "14px 26px", fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  formCard: { background: "#0d1117", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 28, minWidth: 380, maxWidth: 460, width: "100%", boxShadow: "0 24px 64px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)" },
  formCompactHeader: { display: "flex", alignItems: "center", gap: 14, paddingBottom: 18, marginBottom: 20, borderBottom: "1px solid rgba(255,255,255,0.06)" },
  formTitle: { fontSize: 22, fontWeight: 800, color: "#F59E0B", letterSpacing: -0.4, lineHeight: 1.1 },
  formSubtitle: { fontSize: 12.5, color: "#9ca3af", marginTop: 4, fontWeight: 500 },
  formRow: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 14, textAlign: "left" },
  label: { fontSize: 11, color: "#7d8590", letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", fontWeight: 700 },
  value: { fontSize: 18, fontWeight: 700, color: "#fff" },
  input: { background: "#0a0e16", border: "1px solid #30363d", borderRadius: 10, padding: "14px 16px", color: "#fff", fontSize: 22, fontFamily: "'Geist Mono',monospace", fontWeight: 700, outline: "none", boxSizing: "border-box", textAlign: "center" },
  hint: { marginTop: 20, fontSize: 12, color: "#555" },
  hintSm: { fontSize: 11, color: "#666", marginTop: 4 },
  err: { background: "#7f1d1d", border: "1px solid #ef4444", color: "#fff", padding: "9px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, marginTop: 14, maxWidth: 440 },
};
