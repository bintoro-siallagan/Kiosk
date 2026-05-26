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
      { num: "1", title: "Buka Shift", desc: "Klik START DAY → input Opening Cash (modal kas laci) → MULAI SHIFT." },
      { num: "2", title: "Buka Layar Pelanggan (CDS)", desc: "Klik tombol 📺 Buka Layar Pelanggan di bawah → window CDS muncul di TV second screen. Allow popup kalau diminta." },
      { num: "3", title: "Pilih Jadwal", desc: "Klik kartu showtime hari ini. Walk-in late entry ≤60 menit masih boleh." },
      { num: "4", title: "Pilih Kursi", desc: "Click kursi (max 6). Customer di CDS lihat seat map real-time + harga per kategori." },
      { num: "5", title: "Bundle F&B (opsional)", desc: "Tambah combo popcorn/drink → masuk concession queue staff F&B." },
      { num: "6", title: "Lanjut Bayar", desc: "Pilih method: Cash / QRIS / Debit / Voucher. QRIS auto-detect bayar tiap 3 detik." },
      { num: "7", title: "Cetak Tiket", desc: "Klik 🖨️ Cetak Tiket — tiap tiket 1 halaman (auto-cut thermal printer atau gunting per halaman A4)." },
      { num: "8", title: "Tutup Shift", desc: "Klik Logout merah → closing checklist → input cash drawer real → submit." },
    ],
    tips: [
      "Emergency logout di Console: ketik posLogout() → reload + login screen fresh.",
      "Force fresh login: tambah &fresh=1 di URL → clear session.",
      "Multi-outlet: ?outlet=JKT01 → branding & pricing per outlet otomatis.",
    ],
  },
  "cinema-cds": {
    title: "📺 CDS — Customer Display (Second Screen)",
    accent: "#22d3ee",
    steps: [
      { num: "1", title: "Display-Only", desc: "Layar TV non-touch. Customer tidak bisa interact langsung, hanya lihat info." },
      { num: "2", title: "Auto-Sync dengan POS", desc: "WebSocket terkoneksi otomatis. Tiap perubahan di POS Cinema langsung muncul di sini." },
      { num: "3", title: "Stage Idle", desc: "Background custom + 'Selamat Datang' + carousel showtime hari ini auto-rotate 7 detik." },
      { num: "4", title: "Stage Selling", desc: "Saat kasir pilih film: poster gede + info + seat map (kursi blink amber) + breakdown harga real-time." },
      { num: "5", title: "Stage Pay", desc: "Saat kasir generate QRIS: QR code 360×360 + total Rp gede. Customer scan dengan e-wallet." },
      { num: "6", title: "Stage Done", desc: "Tiket sukses + QR rating film (customer scan dengan HP → mobile feedback)." },
    ],
    tips: [
      "Buka full-screen dengan F11 untuk experience optimal.",
      "Custom background: Admin → Cinema Ops → tab Branding CDS.",
      "Disconnect: WebSocket auto-reconnect tiap 2 detik. Kalau stuck, refresh tab.",
    ],
  },
  "cinema-kds": {
    title: "👨‍🍳 KDS — Kitchen Display F&B",
    accent: "#10b981",
    steps: [
      { num: "1", title: "Dua Kolom Antrian", desc: "Kiri: 🍿 Concession (bundle dari tiket, diambil di counter). Kanan: 🎬 In-Studio (order QR di kursi, diantar runner)." },
      { num: "2", title: "Color-coded Age", desc: "🟩 hijau <5min · 🟧 amber 5-15min · 🟥 merah ≥15min. Kerjakan yang merah duluan." },
      { num: "3", title: "Concession Workflow", desc: "Customer ambil di counter → klik [✓ AMBIL] → card hilang dari queue." },
      { num: "4", title: "In-Studio Workflow", desc: "Pending → klik [🍳 Mulai Siapkan] → preparing → antar ke kursi → klik [🚶 Sudah Diantar]." },
      { num: "5", title: "Real-time Sync", desc: "Customer di HP lihat timeline geser (Dibayar → Disiapkan → Diantar) sesuai klik staff." },
    ],
    tips: [
      "Filter per studio: pilih dropdown di topbar.",
      "Polling 5 detik — atau klik ↻ Refresh manual untuk update instant.",
      "Notes order muncul di card amber highlight (mis. 'tanpa garam')",
    ],
  },
  "cinema": {
    title: "🎬 Cinema Kiosk — Customer Self-Service",
    accent: "#a855f7",
    steps: [
      { num: "1", title: "Pilih Film", desc: "Browse film yang lagi tayang. Klik kartu film → modal trailer auto-play + sinopsis." },
      { num: "2", title: "Pesan Tiket", desc: "Di modal trailer, klik tombol gold 🎟️ Pesan Tiket Sekarang." },
      { num: "3", title: "Pilih Jadwal", desc: "Tap showtime yang tersedia. Sold-out atau closed di-disabled." },
      { num: "4", title: "Pilih Kursi", desc: "Max 6 kursi per transaksi (anti double-sell hold 5 menit). Warna kategori: hijau regular, kuning premium, pink couple, ungu VIP." },
      { num: "5", title: "Bundle F&B", desc: "Pilih combo popcorn/drink (opsional). Diambil di counter saat film mulai." },
      { num: "6", title: "Bayar QRIS", desc: "Scan QR code dengan e-wallet (GoPay/OVO/DANA/ShopeePay)." },
      { num: "7", title: "Tiket Digital", desc: "QR code per tiket muncul. Bisa share via WhatsApp atau screenshot." },
      { num: "8", title: "Auto-Reset", desc: "20 detik setelah selesai, halaman balik ke home untuk customer berikutnya." },
    ],
    tips: [
      "Untuk film 17+/D21, ada konfirmasi usia sebelum lanjut.",
      "Rating film bisa di-input di done stage — bonus voucher F&B!",
      "Multi-outlet: URL ?outlet=JKT01 filter showtime + harga sesuai outlet.",
    ],
  },
  "cinema-snack": {
    title: "🍿 In-Studio QR Order",
    accent: "#f59e0b",
    steps: [
      { num: "1", title: "Scan QR di Kursi", desc: "Sticker QR di lengan kursi → scan dengan kamera HP → buka halaman pesan." },
      { num: "2", title: "Pilih Menu", desc: "Browse popcorn, drinks, nachos, dll. Tambah ke cart, set quantity." },
      { num: "3", title: "Isi Detail", desc: "Nomor kursi auto-fill dari QR. Tambah catatan kalau perlu (mis. 'tanpa garam')." },
      { num: "4", title: "Bayar QRIS Dulu", desc: "WAJIB bayar sebelum order masuk antrian staff. Scan QR dengan e-wallet." },
      { num: "5", title: "Live Tracking", desc: "Timeline auto-update: 💳 Dibayar → 🍳 Disiapkan → 🚶 Diantar (poll backend tiap 5 detik)." },
      { num: "6", title: "Pesanan Sampai", desc: "Staff antar ke kursi Anda. Selamat menikmati 🍿" },
    ],
    tips: [
      "Order baru dibuat setelah payment confirmed — anti-spoof.",
      "Estimasi: 5-10 menit dari klik bayar sampai sampai kursi.",
      "Trouble? Tunjukkan order code ke staff terdekat.",
    ],
  },
  "cinema-feedback": {
    title: "⭐ Mobile Rating Feedback",
    accent: "#ec4899",
    steps: [
      { num: "1", title: "Scan QR di CDS", desc: "Selesai beli tiket, di TV layar muncul QR code 'RATE FILM INI' — scan dengan HP." },
      { num: "2", title: "Pilih Bintang", desc: "Tap 1-5 bintang sesuai pendapat. Label dynamic: 1=Sangat Buruk, 5=Sangat Bagus." },
      { num: "3", title: "Komentar (Opsional)", desc: "Tulis kesan singkat untuk improvement kami." },
      { num: "4", title: "Submit", desc: "Klik Kirim Rating — dapet ✨ confirmation + tease voucher F&B gratis." },
    ],
    tips: [
      "Feedback anonymous & disimpan untuk improvement.",
      "Tunjukkan halaman thank-you ke staff untuk klaim voucher F&B.",
      "Bisa di-rate setelah nonton — gak harus pas di counter.",
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
