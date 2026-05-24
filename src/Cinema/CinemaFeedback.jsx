// karyaOS — Mobile feedback page (customer scan QR di CDS → buka di HP)
// Route: /?cinema-feedback&film=ID&title=NAMA&p=PURCHASE_ID
// Simple star rating + comment form, mobile-first design.
import { useState, useEffect } from "react";

const API_HOST = import.meta.env.VITE_API_URL || "http://localhost:3001";

export default function CinemaFeedback() {
  const params = new URLSearchParams(window.location.search);
  const filmId = params.get("film");
  const filmTitle = params.get("title") || "";
  const purchaseId = params.get("p") || "";

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  // Reset CSS root width cap
  useEffect(() => {
    const root = document.getElementById("root");
    if (root) { root.style.maxWidth = "none"; root.style.width = "100%"; root.style.padding = "0"; }
    return () => { if (root) { root.style.maxWidth = ""; root.style.width = ""; root.style.padding = ""; } };
  }, []);

  const submit = async () => {
    if (!rating || sent) return;
    setSubmitting(true); setError("");
    try {
      const r = await fetch(`${API_HOST}/api/cinema/films/${filmId}/rate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating, comment: comment.trim() || null,
          customer_name: name.trim() || null,
          ticket_code: purchaseId || null,
          source: "mobile",
        }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || "Submit gagal");
      setSent(true);
    } catch (e) { setError(e.message); }
    setSubmitting(false);
  };

  if (sent) {
    return (
      <Shell>
        <div style={{ textAlign: "center", padding: "40px 24px" }}>
          <div style={{ fontSize: 80, marginBottom: 14, filter: "drop-shadow(0 0 24px rgba(251,191,36,0.4))" }}>✨</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: "#fff", marginBottom: 8 }}>Terima Kasih!</div>
          <div style={{ fontSize: 14, color: "#cbd5e1", marginBottom: 24, lineHeight: 1.5 }}>
            Rating Anda <b style={{ color: "#fbbf24" }}>{rating}★</b> sudah kami terima.<br/>
            Selamat menikmati filmnya 🍿
          </div>
          <div style={{ padding: 16, background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.25)", borderRadius: 12, fontSize: 12, color: "#c084fc", lineHeight: 1.5 }}>
            💡 Tunjukkan kepada staff untuk dapat 1× voucher F&B gratis untuk pembelian berikutnya
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div style={{ padding: "30px 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 48, marginBottom: 8, lineHeight: 1 }}>🎬</div>
          <div style={{ fontSize: 12, color: "#a855f7", letterSpacing: 3, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>karyaOS CINEMA</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: "#fff", marginTop: 4, letterSpacing: -0.5, lineHeight: 1.2 }}>Beri Rating Filmnya</div>
          {filmTitle && <div style={{ fontSize: 16, color: "#fbbf24", marginTop: 6, fontWeight: 700 }}>{filmTitle}</div>}
        </div>

        {/* Star rating — TAP-friendly */}
        <div style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 20, marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#9ca3af", letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", fontWeight: 700, marginBottom: 14, textAlign: "center" }}>SEBERAPA SUKA?</div>
          <div style={{ display: "flex", justifyContent: "center", gap: 6 }}>
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} onClick={() => setRating(n)}
                style={{ background: "transparent", border: "none", fontSize: 52, cursor: "pointer", padding: 4, lineHeight: 1, color: n <= rating ? "#fbbf24" : "rgba(255,255,255,0.18)", transition: "transform 0.18s ease, color 0.18s ease", transform: n <= rating ? "scale(1.08)" : "scale(1)", touchAction: "manipulation" }}>★</button>
            ))}
          </div>
          {rating > 0 && (
            <div style={{ textAlign: "center", marginTop: 12, fontSize: 14, color: "#fbbf24", fontWeight: 700 }}>
              {["", "Sangat Buruk", "Buruk", "Cukup", "Bagus", "Sangat Bagus"][rating]}
            </div>
          )}
        </div>

        {/* Optional fields */}
        <div style={{ marginBottom: 14 }}>
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Nama Anda (opsional)"
            style={inp} />
        </div>
        <div style={{ marginBottom: 18 }}>
          <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Komentar / kesan (opsional)" rows={4}
            style={{ ...inp, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }} />
        </div>

        {error && <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, color: "#fca5a5", fontSize: 13, marginBottom: 14 }}>⚠ {error}</div>}

        <button onClick={submit} disabled={!rating || submitting}
          style={{
            width: "100%", padding: "16px 24px",
            background: rating ? "linear-gradient(135deg,#fbbf24,#f59e0b)" : "rgba(255,255,255,0.06)",
            border: "none", borderRadius: 14, color: rating ? "#1a1205" : "rgba(255,255,255,0.4)",
            fontSize: 16, fontWeight: 900, fontFamily: "inherit", letterSpacing: 0.5,
            cursor: rating && !submitting ? "pointer" : "not-allowed",
            boxShadow: rating ? "0 8px 24px rgba(251,191,36,0.3), inset 0 1px 0 rgba(255,255,255,0.25)" : "none",
            transition: "transform 0.15s ease, filter 0.15s ease",
          }}>
          {submitting ? "⏳ Mengirim..." : rating ? `Kirim Rating ${rating}★` : "Pilih bintang dulu"}
        </button>

        <div style={{ marginTop: 18, padding: 12, background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.2)", borderRadius: 10, fontSize: 11, color: "#9ca3af", lineHeight: 1.55, textAlign: "center" }}>
          🔒 Feedback Anda anonymous & disimpan untuk improvement kami
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "linear-gradient(160deg,#050810 0%,#0c0f1a 50%,#08090f 100%)", color: "#e6edf3", fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif", overflowY: "auto" }}>
      <div aria-hidden style={{ position: "fixed", inset: 0, background: "radial-gradient(700px 500px at 50% 0%, rgba(168,85,247,0.1), transparent 60%)", pointerEvents: "none" }} />
      <div style={{ position: "relative", maxWidth: 460, margin: "0 auto" }}>{children}</div>
    </div>
  );
}

const inp = {
  width: "100%", boxSizing: "border-box",
  background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 12, padding: "12px 16px", color: "#fff",
  fontSize: 14, fontFamily: "inherit", outline: "none",
};
