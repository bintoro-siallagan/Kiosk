// karyaOS — Reusable Help Modal + Floating Help Button
// Embed in-context help di tiap surface. Klik ? → modal step-by-step muncul.
//
// Usage:
//   import { HelpButton, HelpModal } from "./components/HelpModal";
//   <HelpButton helpKey="pos-cinema" />
//
// Atau manual:
//   const [open, setOpen] = useState(false);
//   <HelpModal show={open} onClose={() => setOpen(false)} helpKey="pos-cinema" />

import { useState } from "react";

// ═══════════════════════════════════════════════════════════════════
// HELP CONTENT — per-surface step-by-step
// ═══════════════════════════════════════════════════════════════════
const HELP = {
  "pos-cinema": {
    title: "🎟️ POS Cinema — Kasir",
    accent: "#fbbf24",
    steps: [
      { num: "1", title: "Open Shift", desc: "Click START DAY → enter Opening Cash → START SHIFT." },
      { num: "2", title: "Open Customer Display (CDS)", desc: "Click 📺 Open Customer Display below → CDS window opens on second screen TV. Allow popup if prompted." },
      { num: "3", title: "Pick Showtime", desc: "Click any showtime card. Walk-in late entry up to 60 min allowed." },
      { num: "4", title: "Pick Seats", desc: "Click seats (max 6). Customer sees real-time seat map + per-category pricing on CDS." },
      { num: "5", title: "F&B Bundle (optional)", desc: "Add popcorn/drink combo → enters concession queue for F&B staff." },
      { num: "6", title: "Proceed to Payment", desc: "Choose method: Cash / QRIS / Debit / Voucher. QRIS auto-detect payment every 3 sec." },
      { num: "7", title: "Print Ticket", desc: "Klik 🖨️ Print Ticket — tiap tiket 1 halaman (auto-cut thermal printer atau gunting per halaman A4)." },
      { num: "8", title: "Close Shift", desc: "Click red Logout → closing checklist → enter actual cash drawer → submit." },
    ],
    tips: [
      "Emergency logout from Console: type posLogout() → reload + fresh login.",
      "Force fresh login: append &fresh=1 to URL → clears session.",
      "Multi-outlet: ?outlet=JKT01 → per-outlet branding & pricing auto-applied.",
    ],
  },
  "cinema-cds": {
    title: "📺 CDS — Customer Display (Second Screen)",
    accent: "#22d3ee",
    steps: [
      { num: "1", title: "Display Only", desc: "Non-touch TV screen. Customers cannot interact directly, only view info." },
      { num: "2", title: "Auto-Sync with POS", desc: "WebSocket connects automatically. Every change in POS Cinema appears here in real-time." },
      { num: "3", title: "Stage Idle", desc: 'Custom background + "Welcome" + carousel of today\'s showtimes auto-rotates every 7 sec.' },
      { num: "4", title: "Stage Selling", desc: "When cashier picks film: large poster + info + seat map (selected seats blink amber) + real-time price breakdown." },
      { num: "5", title: "Stage Pay", desc: "When cashier generates QRIS: 360×360 QR code + large total. Customer scans with e-wallet." },
      { num: "6", title: "Stage Done", desc: "Ticket issued + film rating QR (customer scans with phone → mobile feedback)." },
    ],
    tips: [
      "Open full-screen with F11 for optimal experience.",
      "Custom background: Admin → Cinema Ops → CDS Branding tab.",
      "Disconnect: WebSocket auto-reconnects every 2 sec. If stuck, refresh tab.",
    ],
  },
  "cinema-kds": {
    title: "👨‍🍳 KDS — Kitchen Display F&B",
    accent: "#10b981",
    steps: [
      { num: "1", title: "Two Queue Columns", desc: "Left: 🍿 Concession (bundles from tickets, picked up at counter). Right: 🎬 In-Studio (QR orders from seats, delivered by runner)." },
      { num: "2", title: "Color-coded Age", desc: "🟩 green <5min · 🟧 amber 5-15min · 🟥 red ≥15min. Prioritize red first." },
      { num: "3", title: "Concession Workflow", desc: "Customer picks up at counter → click [✓ PICKED UP] → card removed from queue." },
      { num: "4", title: "In-Studio Workflow", desc: "Pending → click [🍳 Start Preparing] → preparing → deliver to seat → click [🚶 Delivered]." },
      { num: "5", title: "Real-time Sync", desc: "Customer's phone shows live timeline (Paid → Preparing → Delivered) based on staff clicks." },
    ],
    tips: [
      "Filter per studio: pick dropdown in topbar.",
      "Polls every 5 sec — or click ↻ Refresh manually for instant update.",
      'Order notes appear in amber highlight (e.g., "no salt")',
    ],
  },
  "cinema": {
    title: "🎬 Cinema Kiosk — Customer Self-Service",
    accent: "#a855f7",
    steps: [
      { num: "1", title: "Pick a Film", desc: "Browse currently showing films. Click film card → trailer modal auto-plays + synopsis." },
      { num: "2", title: "Buy Tickets", desc: "Di modal trailer, klik tombol gold 🎟️ Buy Tickets Sekarang." },
      { num: "3", title: "Pick Showtime", desc: "Tap any available showtime. Sold-out or closed are disabled." },
      { num: "4", title: "Pick Seats", desc: "Max 6 seats per transaction (anti double-sell 5-min hold). Categories: green regular, yellow premium, pink couple, purple VIP." },
      { num: "5", title: "Bundle F&B", desc: "Pick popcorn/drink combo (optional). Pick up at counter when film starts." },
      { num: "6", title: "Pay with QRIS", desc: "Scan QR code with e-wallet (GoPay/OVO/DANA/ShopeePay)." },
      { num: "7", title: "Digital Ticket", desc: "QR code per ticket appears. Share via WhatsApp or screenshot." },
      { num: "8", title: "Auto-Reset", desc: "20 sec after done, page resets to home for next customer." },
    ],
    tips: [
      "For 17+/D21 films, age confirmation is required before continuing.",
      "Film rating can be submitted on done stage — bonus F&B voucher!",
      "Multi-outlet: URL ?outlet=JKT01 filters showtime + pricing per outlet.",
    ],
  },
  "cinema-snack": {
    title: "🍿 In-Studio QR Order",
    accent: "#f59e0b",
    steps: [
      { num: "1", title: "Scan QR on Seat", desc: "QR sticker on seat armrest → scan with phone camera → opens order page." },
      { num: "2", title: "Pick Menu", desc: "Browse popcorn, drinks, nachos, etc. Add to cart, set quantity." },
      { num: "3", title: "Fill Details", desc: 'Seat number auto-filled from QR. Add notes if needed (e.g., "no salt").' },
      { num: "4", title: "Pay with QRIS First", desc: "Must pay before order enters staff queue. Scan QR with e-wallet." },
      { num: "5", title: "Live Tracking", desc: "Timeline auto-updates: 💳 Paid → 🍳 Preparing → 🚶 Delivered (polls every 5 sec)." },
      { num: "6", title: "Order Arrives", desc: "Staff delivers to your seat. Enjoy 🍿" },
    ],
    tips: [
      "Order created only after payment confirmed — anti-spoof.",
      "Estimated 5-10 min from payment to seat delivery.",
      "Trouble? Show order code to nearest staff.",
    ],
  },
  "cinema-feedback": {
    title: "⭐ Mobile Rating Feedback",
    accent: "#ec4899",
    steps: [
      { num: "1", title: "Scan QR on CDS", desc: 'After buying ticket, the CDS displays a "RATE THIS FILM" QR — scan with your phone.' },
      { num: "2", title: "Pick Stars", desc: "Tap 1-5 stars based on your opinion. Dynamic label: 1=Very Bad, 5=Excellent." },
      { num: "3", title: "Comment (Optional)", desc: "Write a brief opinion for our improvement." },
      { num: "4", title: "Submit", desc: "Click Submit Rating — get ✨ confirmation + free F&B voucher tease." },
    ],
    tips: [
      "Feedback is anonymous & stored for improvement.",
      "Show thank-you page to staff to claim F&B voucher.",
      "Can rate after watching — no need to do it at the counter.",
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════
// MAIN MODAL COMPONENT
// ═══════════════════════════════════════════════════════════════════
export function HelpModal({ show, onClose, helpKey, customContent }) {
  if (!show) return null;
  const content = customContent || HELP[helpKey];
  if (!content) {
    return (
      <Backdrop onClose={onClose}>
        <Card accent="#fbbf24" onClose={onClose} title="Help">
          <div style={{ padding: 20, color: "#fca5a5", fontSize: 13 }}>
            Help content untuk "{helpKey}" belum tersedia.
          </div>
        </Card>
      </Backdrop>
    );
  }

  return (
    <Backdrop onClose={onClose}>
      <Card accent={content.accent} onClose={onClose} title={content.title}>
        {/* Steps */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {content.steps.map((s) => (
            <div key={s.num} style={{ display: "flex", gap: 12, padding: "12px 14px", background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10 }}>
              <div style={{
                flexShrink: 0, width: 32, height: 32, borderRadius: 8,
                background: `${content.accent}22`, border: `1px solid ${content.accent}55`,
                color: content.accent, fontSize: 13, fontWeight: 800,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "'Geist Mono',monospace",
              }}>{s.num}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#fff", marginBottom: 4 }}>{s.title}</div>
                <div style={{ fontSize: 12, color: "#cbd5e1", lineHeight: 1.5 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Tips */}
        {content.tips && content.tips.length > 0 && (
          <div style={{ marginTop: 16, padding: 14, background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.2)", borderRadius: 10 }}>
            <div style={{ fontSize: 11, color: "#22d3ee", letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", fontWeight: 800, marginBottom: 8 }}>💡 TIPS & SHORTCUTS</div>
            <ul style={{ margin: 0, padding: "0 0 0 18px", fontSize: 12, color: "#cbd5e1", lineHeight: 1.7 }}>
              {content.tips.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 14, padding: 10, background: "rgba(255,255,255,0.02)", borderRadius: 8, fontSize: 11, color: "#7d8590", textAlign: "center" }}>
          📘 Manual lengkap: <a href="https://github.com/bintoro-siallagan/Kiosk/blob/main/ONBOARDING.md" target="_blank" rel="noreferrer" style={{ color: content.accent, textDecoration: "none" }}>ONBOARDING.md</a>
        </div>
      </Card>
    </Backdrop>
  );
}

// ═══════════════════════════════════════════════════════════════════
// FLOATING HELP BUTTON — drop-in anywhere
// ═══════════════════════════════════════════════════════════════════
export function HelpButton({ helpKey, position = "bottom-right" }) {
  const [show, setShow] = useState(false);
  const positions = {
    "bottom-right": { bottom: 24, right: 24 },
    "bottom-left": { bottom: 24, left: 24 },
    "top-right": { top: 80, right: 24 },
    "top-left": { top: 80, left: 24 },
  };
  const pos = positions[position] || positions["bottom-right"];
  return (
    <>
      <button
        onClick={() => setShow(true)}
        title="Bantuan / Help"
        style={{
          position: "fixed", ...pos, zIndex: 999,
          width: 44, height: 44, borderRadius: "50%",
          background: "rgba(34,211,238,0.15)", border: "2px solid #22d3ee",
          color: "#22d3ee", fontSize: 18, fontWeight: 900, cursor: "pointer",
          fontFamily: "inherit", boxShadow: "0 4px 16px rgba(34,211,238,0.3), 0 0 0 4px rgba(34,211,238,0.08)",
          backdropFilter: "blur(8px)", transition: "transform 0.15s ease, filter 0.15s ease",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.1)"; e.currentTarget.style.filter = "brightness(1.15)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.filter = "none"; }}
      >?</button>
      <HelpModal show={show} onClose={() => setShow(false)} helpKey={helpKey} />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
function Backdrop({ children, onClose }) {
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.78)", backdropFilter: "blur(12px)",
      zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      animation: "karyaHelpFade 0.2s ease-out",
    }}>
      <style>{`@keyframes karyaHelpFade { from { opacity: 0 } to { opacity: 1 } }`}</style>
      {children}
    </div>
  );
}

function Card({ children, onClose, title, accent }) {
  return (
    <div onClick={(e) => e.stopPropagation()} style={{
      background: "linear-gradient(160deg,#08090f 0%,#11131c 50%,#1a1d29 100%)",
      border: `1px solid ${accent}44`, borderRadius: 16,
      padding: 22, maxWidth: 560, width: "100%", maxHeight: "92vh", overflowY: "auto",
      color: "#e6edf3", fontFamily: "'Inter',sans-serif",
      boxShadow: `0 32px 96px rgba(0,0,0,0.7), 0 0 64px ${accent}22, inset 0 1px 0 rgba(255,255,255,0.05)`,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: accent, letterSpacing: -0.2 }}>{title}</div>
        <button onClick={onClose} style={{
          background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 8, color: "#e6edf3", padding: "6px 12px", fontSize: 12, cursor: "pointer",
          fontFamily: "inherit",
        }}>✕</button>
      </div>
      {children}
    </div>
  );
}

export default HelpModal;
