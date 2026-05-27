// karyaOS — Customer Digital Ticket (mobile QR)
// Route: /?ticket=CODE
// Fallback saat printer thermal mati — kasir kirim link via WA, customer
// buka di HP → tunjukkan QR di pintu studio untuk validasi.
import { useState, useEffect } from "react";
import QRCode from "qrcode";
import API_HOST from "../apiBase.js";

const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");

export default function CinemaDigitalTicket() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("ticket") || "";
  const autoPrint = params.get("print") === "1";
  const thermal = params.get("thermal") === "1"; // 80mm thermal printer
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState("");
  const [qrSrc, setQrSrc] = useState(null);
  const [loading, setLoading] = useState(true);

  // Auto-print + close window setelah loaded (untuk Chrome --kiosk-printing flag)
  useEffect(() => {
    if (autoPrint && ticket && qrSrc) {
      const t = setTimeout(() => {
        window.print();
        // Optional: auto-close window setelah print (Chrome will close kalau opened via window.open)
        setTimeout(() => { try { window.close(); } catch {} }, 800);
      }, 500);
      return () => clearTimeout(t);
    }
  }, [autoPrint, ticket, qrSrc]);

  useEffect(() => {
    const root = document.getElementById("root");
    if (root) { root.style.maxWidth = "none"; root.style.width = "100%"; root.style.padding = "0"; }
    return () => { if (root) { root.style.maxWidth = ""; root.style.width = ""; root.style.padding = ""; } };
  }, []);

  useEffect(() => {
    if (!code) { setError("Kode tiket tidak valid"); setLoading(false); return; }
    fetch(`${API_HOST}/api/cinema/tickets/lookup/${encodeURIComponent(code)}`)
      .then(r => r.json())
      .then(d => {
        if (!d.ok) { setError(d.message || d.error || "Tiket tidak ditemukan"); setTicket(d.ticket || null); }
        else setTicket(d.ticket);
      })
      .catch(() => setError("Tiket sedang dipersiapkan, mohon menunggu sebentar."))
      .finally(() => setLoading(false));
  }, [code]);

  useEffect(() => {
    if (!code) return;
    QRCode.toDataURL(code, { width: 260, margin: 1, errorCorrectionLevel: "M", color: { dark: "#000", light: "#fff" } })
      .then(setQrSrc).catch(() => setQrSrc(null));
  }, [code]);

  if (loading) {
    return <Shell><div style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>⏳ Memuat tiket...</div></Shell>;
  }
  if (error || !ticket) {
    return (
      <Shell>
        <div style={{ padding: "40px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 64, marginBottom: 14, opacity: 0.5 }}>⚠</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#fca5a5" }}>{error || "Tiket tidak ditemukan"}</div>
          <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 8 }}>Kode: <code style={{ color: "#fbbf24" }}>{code}</code></div>
          <div style={{ fontSize: 12, color: "#7d8590", marginTop: 16, lineHeight: 1.6 }}>
            Cek ulang link / hubungi kasir cinema untuk bantuan.
          </div>
        </div>
      </Shell>
    );
  }

  const isUsed = !!ticket.checked_in_at;
  const isRefunded = ticket.payment_status === "refunded";

  return (
    <Shell>
      {/* Print CSS — thermal 80mm atau A4 (auto detect via ?thermal=1) */}
      <style>{`
        @media print {
          ${thermal ? '@page { size: 80mm auto; margin: 2mm }' : '@page { size: A6 portrait; margin: 5mm }'}
          html, body { background: #fff !important; color: #000 !important; }
          body * { visibility: hidden }
          .digital-ticket-print, .digital-ticket-print * { visibility: visible }
          .digital-ticket-print { position: absolute; left: 0; top: 0; width: 100%; background: #fff !important; color: #000 !important; padding: ${thermal ? '4mm 2mm' : '8mm'} !important; }
          .digital-ticket-print * { color: #000 !important; background: transparent !important; }
          .digital-ticket-print .qr-card { box-shadow: none !important; border: 1px solid #333 !important; padding: 6mm !important; background: #fff !important; }
          .digital-ticket-print img { width: ${thermal ? '60mm' : '50mm'} !important; height: ${thermal ? '60mm' : '50mm'} !important; }
          .digital-ticket-print .seat-pill { background: #000 !important; color: #fff !important; border: 1px solid #000 !important; }
          .no-print, .tips-section { display: none !important }
        }
      `}</style>
      <div className="digital-ticket-print" style={{ padding: "20px 18px" }}>
        {/* Status banner kalau used/refunded */}
        {isUsed && (
          <div style={{ padding: "10px 14px", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.4)", borderRadius: 10, color: "#10b981", fontSize: 12, fontWeight: 800, textAlign: "center", marginBottom: 14 }}>
            ✓ Tiket sudah di-check-in {new Date(ticket.checked_in_at * 1000).toLocaleString("id-ID")}
          </div>
        )}
        {isRefunded && (
          <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 10, color: "#fca5a5", fontSize: 12, fontWeight: 800, textAlign: "center", marginBottom: 14 }}>
            ⚠ Tiket sudah di-refund / void
          </div>
        )}

        {/* QR Code — big & scan-friendly */}
        <div className="qr-card" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18, padding: 20, textAlign: "center", marginBottom: 14, boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
          <div style={{ fontSize: 10, color: "#fbbf24", letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>🎬 TIKET DIGITAL</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", marginTop: 6, letterSpacing: -0.4, lineHeight: 1.2 }}>{ticket.film_title || "—"}</div>
          {ticket.rating && <span style={{ display: "inline-block", marginTop: 6, fontSize: 10, fontWeight: 800, padding: "2px 10px", borderRadius: 4, background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.4)", color: "#c084fc", fontFamily: "'Geist Mono',monospace" }}>{ticket.rating}</span>}

          {/* QR */}
          <div style={{ marginTop: 18, display: "flex", justifyContent: "center" }}>
            {qrSrc ? (
              <div style={{ background: "#fff", padding: 14, borderRadius: 16, display: "inline-block", boxShadow: "0 4px 24px rgba(0,0,0,0.4), 0 0 0 4px rgba(251,191,36,0.1)" }}>
                <img src={qrSrc} alt={code} style={{ width: 240, height: 240, display: "block" }} />
              </div>
            ) : (
              <div style={{ width: 268, height: 268, background: "rgba(255,255,255,0.05)", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>⏳</div>
            )}
          </div>

          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 12, fontFamily: "'Geist Mono',monospace", letterSpacing: 1, fontWeight: 700 }}>{ticket.code}</div>
          <div style={{ fontSize: 11, color: "#7d8590", marginTop: 4 }}>Show this QR to the usher at the studio entrance</div>
        </div>

        {/* Ticket info */}
        <div style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005))", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 16 }}>
          <Line label="KURSI" value={<span className="seat-pill" style={{ fontSize: 22, fontWeight: 900, padding: "4px 14px", borderRadius: 8, background: "linear-gradient(135deg,#f59e0b,#fbbf24)", color: "#1a1205", fontFamily: "'Geist Mono',monospace" }}>{ticket.seat}</span>} />
          <Line label="STUDIO" value={`${ticket.studio_name || "—"} ${ticket.outlet ? `· ${ticket.outlet}` : ""}`} />
          <Line label="TANGGAL" value={ticket.show_date || "—"} />
          <Line label="JAM" value={<span style={{ fontSize: 18, fontWeight: 800, color: "#fbbf24", fontFamily: "'Geist Mono',monospace" }}>{ticket.start_time || "—"}</span>} />
          {ticket.format && <Line label="FORMAT" value={ticket.format} />}
          {ticket.duration_min && <Line label="DURASI" value={`${ticket.duration_min} menit`} />}
          <Line label="HARGA" value={<span style={{ color: "#10b981", fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>{rp(ticket.price)}</span>} />
        </div>

        {/* Tips — hidden saat print */}
        <div className="tips-section" style={{ marginTop: 14, padding: 14, background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.2)", borderRadius: 10 }}>
          <div style={{ fontSize: 11, color: "#22d3ee", fontWeight: 800, marginBottom: 6, fontFamily: "'Geist Mono',monospace", letterSpacing: 1.2 }}>💡 TIPS</div>
          <ul style={{ margin: 0, padding: "0 0 0 18px", fontSize: 12, color: "#cbd5e1", lineHeight: 1.7 }}>
            <li>Datang 15 menit sebelum jam tayang</li>
            <li>Show QR to the usher at studio entrance (phone screen is fine)</li>
            <li>QR cukup di-scan sekali — kalau gagal, kasih kode {ticket.code} ke usher</li>
            <li>Tiket berlaku hanya untuk jadwal & kursi di atas</li>
          </ul>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "radial-gradient(ellipse 70% 55% at 50% 38%, rgba(70,76,98,0.45) 0%, transparent 70%), linear-gradient(160deg,#12141c 0%,#181b25 50%,#22253a 100%)", color: "#e6edf3", fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif", overflowY: "auto" }}>
      <div aria-hidden style={{ position: "fixed", inset: 0, background: "radial-gradient(700px 500px at 50% 0%, rgba(245,158,11,0.08), transparent 60%)", pointerEvents: "none" }} />
      <div style={{ position: "relative", maxWidth: 460, margin: "0 auto" }}>{children}</div>
    </div>
  );
}

function Line({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", gap: 14 }}>
      <span style={{ fontSize: 10, color: "#7d8590", letterSpacing: 1.4, fontFamily: "'Geist Mono',monospace", fontWeight: 700 }}>{label}</span>
      <span style={{ fontSize: 13, color: "#e6edf3", textAlign: "right", fontWeight: 600 }}>{value}</span>
    </div>
  );
}
