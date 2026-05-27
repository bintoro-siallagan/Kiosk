import React, { useEffect, useState, useRef } from "react";
import API_HOST from "../apiBase.js";
import POSCelebration from "../POS/POSCelebration.jsx";

const API = API_HOST;
const fIDR = n => "Rp " + (n || 0).toLocaleString("id-ID");

// Map backend status → step index (0 diterima, 1 disiapkan, 2 siap, 3 selesai)
const STATUS_TO_STEP = {
  waiting: 0,
  received: 0,
  pending: 0,
  new: 0,
  preparing: 1,
  in_progress: 1,
  processing: 1,
  cooking: 1,
  ready: 2,
  prepared: 2,
  done: 3,
  completed: 3,
  picked_up: 3,
  finished: 3,
};

export default function FlowSuccess({ order, session, onHome, onOrderMore }) {
  const [trackingUrl, setTrackingUrl] = useState("");
  const [currentStatus, setCurrentStatus] = useState(order.status || "waiting");
  const [orderData, setOrderData] = useState(order);
  // Sultan celebration popup — auto-show 1.2s setelah masuk success screen
  const [showCelebration, setShowCelebration] = useState(false);
  const celebrationShown = useRef(false);
  const pollRef = useRef(null);

  useEffect(() => {
    const baseUrl = window.location.origin + window.location.pathname;
    setTrackingUrl(`${baseUrl}?trackorder=${order.id}`);
  }, [order]);

  // Auto-show Sultan popup setelah customer liat konfirmasi order (delay ~1.2s)
  useEffect(() => {
    if (celebrationShown.current) return;
    celebrationShown.current = true;
    const t = setTimeout(() => setShowCelebration(true), 1200);
    return () => clearTimeout(t);
  }, []);

  // Live status polling every 5s
  useEffect(() => {
    async function poll() {
      try {
        const r = await fetch(`${API}/api/orders/${order.id}`);
        if (r.ok) {
          const data = await r.json();
          const o = data.order || data;
          if (o.status) {
            setCurrentStatus(o.status);
            setOrderData(o);
          }
        }
      } catch {}
    }
    poll();
    pollRef.current = setInterval(poll, 5000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [order.id]);

  const currentStep = STATUS_TO_STEP[currentStatus] ?? 0;

  function openWhatsApp() {
    const phone = (session.phone || "").replace(/[^0-9]/g, "");
    const intl = phone.startsWith("0") ? "62" + phone.substring(1) : phone;
    const msg = encodeURIComponent(
      `Halo, saya baru aja order di KaryaOS!\n\n` +
      `Order #${order.id}\nTotal: ${fIDR(orderData.total || order.total)}\n\nTracking: ${trackingUrl}`
    );
    window.open(`https://wa.me/${intl}?text=${msg}`, "_blank");
  }

  return (
    <div style={S.container}>
      <div style={S.celebration}>
        <div style={S.successIcon}>
          {currentStep >= 3 ? "🎉" : currentStep >= 2 ? "🛎️" : currentStep >= 1 ? "👨‍🍳" : "✅"}
        </div>
        <div style={{...S.title, color: currentStep >= 3 ? "var(--brand-primary,#FF6B35)" : "#10B981"}}>
          {currentStep >= 3 && "Order Complete!"}
          {currentStep === 2 && "Pesanan Siap Diambil!"}
          {currentStep === 1 && "Sedang Preparing"}
          {currentStep === 0 && "Pesanan Diterima!"}
        </div>
        <div style={S.subtitle}>
          {currentStep >= 3 && "Terima kasih sudah order di KaryaOS ☕"}
          {currentStep === 2 && "Silakan diambil di counter / meja kamu"}
          {currentStep === 1 && "Barista lagi nyiapin pesanan kamu"}
          {currentStep === 0 && "Akan segera dipersiapkan"}
        </div>
      </div>

      <div style={S.orderCard}>
        <div style={S.orderId}>#{order.id}</div>
        <div style={S.orderTotal}>{fIDR(orderData.total || order.total)}</div>
        <div style={S.orderMeta}>
          {(orderData.type || order.type) === "dine" ? `🍽️ Dine In · Meja ${orderData.table || order.table || "-"}` : "🛍️ Bawa Pulang"}
        </div>
      </div>

      <div style={S.steps}>
        <Step icon="📥" label="Diterima" active={currentStep >= 0} done={currentStep > 0} />
        <StepLine done={currentStep > 0} />
        <Step icon="👨‍🍳" label="Preparing" active={currentStep >= 1} done={currentStep > 1} />
        <StepLine done={currentStep > 1} />
        <Step icon="🛎️" label="Siap" active={currentStep >= 2} done={currentStep > 2} />
        <StepLine done={currentStep > 2} />
        <Step icon="🎉" label="Done" active={currentStep >= 3} done={currentStep >= 3} />
      </div>

      <div style={S.statusBox}>
        <div style={S.statusDot} />
        <span>Live update setiap 5 detik · Status: <strong>{currentStatus}</strong></span>
      </div>

      <div style={S.infoCard}>
        <div style={S.infoTitle}>📱 Notifikasi WhatsApp</div>
        <div style={S.infoText}>
          Status pesanan kamu akan dikirim via WA secara otomatis. Pastikan no HP <strong>{session.phone}</strong> aktif.
        </div>
      </div>

      <div style={S.btnRow}>
        <button onClick={openWhatsApp} style={S.btnSecondary}>📱 Share via WA</button>
        <button onClick={() => window.open(trackingUrl, "_blank")} style={S.btnSecondary}>🔍 Track</button>
      </div>

      <button onClick={() => setShowCelebration(true)} style={{ ...S.btnSecondary, marginTop: 8, background: "linear-gradient(135deg,rgba(251,191,36,0.18),rgba(168,85,247,0.18))", borderColor: "rgba(251,191,36,0.45)", color: "#fbbf24" }}>
        👑 Lihat Gelar Sultan Jam Ini
      </button>

      <button onClick={onOrderMore} style={S.btnPrimary}>🛒 Pesan Lagi</button>
      <button onClick={onHome} style={S.btnGhost}>← Kembali ke Home</button>

      <div style={S.footer}>KaryaOS Flow · Mobile Order Portal</div>

      {/* Sultan celebration popup — gelar customer berdasar total + leaderboard jam ini */}
      {showCelebration && (
        <POSCelebration
          apiBase={API}
          order={{
            id: order.id,
            customerName: session?.name || (session?.phone ? `Tamu ${String(session.phone).slice(-4)}` : "Tamu"),
            total: orderData.total || order.total,
          }}
          onDone={() => setShowCelebration(false)}
        />
      )}
    </div>
  );
}

function Step({ icon, label, active, done }) {
  return (
    <div style={{
      ...S.step,
      ...(active ? S.stepActive : {}),
      ...(done ? S.stepDone : {}),
    }}>
      <div style={{
        ...S.stepIcon,
        ...(active ? S.stepIconActive : {}),
        ...(done ? S.stepIconDone : {}),
      }}>
        {done ? "✓" : icon}
      </div>
      <div style={S.stepLabel}>{label}</div>
    </div>
  );
}

function StepLine({ done }) {
  return <div style={{...S.stepLine, ...(done ? S.stepLineDone : {})}} />;
}

const S = {
  container: { width: "min(440px, 100%)", minHeight: "100vh", padding: "32px 20px", display: "flex", flexDirection: "column", gap: 18, animation: "fadeUp 0.5s ease" },
  celebration: { textAlign: "center", padding: "20px 0" },
  successIcon: { fontSize: 72, animation: "successPop 0.6s ease", marginBottom: 32 },
  title: { fontSize: 24, fontWeight: 800, marginTop: 8 },
  subtitle: { fontSize: 13, color: "#9CA3AF", marginTop: 4, padding: "0 20px" },
  orderCard: { padding: "20px", borderRadius: 16, background: "linear-gradient(135deg, rgba(245,158,11,0.10), rgba(245,158,11,0.02))", border: "1px solid rgba(245,158,11,0.3)", textAlign: "center" },
  orderId: { fontFamily: "'Inter', sans-serif", fontSize: 36, color: "var(--brand-primary,#FF6B35)", letterSpacing: 2 },
  orderTotal: { fontSize: 20, fontWeight: 800, marginTop: 4 },
  orderMeta: { fontSize: 12, color: "#9CA3AF", marginTop: 8 },
  steps: { display: "flex", alignItems: "center", gap: 2, padding: "12px 0" },
  step: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, opacity: 0.3, transition: "opacity 0.3s ease" },
  stepActive: { opacity: 0.7 },
  stepDone: { opacity: 1 },
  stepIcon: { width: 40, height: 40, borderRadius: 20, background: "rgba(255,255,255,0.04)", border: "1px solid #2a2a2a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, transition: "all 0.3s ease" },
  stepIconActive: { background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.4)", color: "var(--brand-primary,#FF6B35)" },
  stepIconDone: { background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.5)", color: "#10B981", fontSize: 18 },
  stepLabel: { fontSize: 9, fontWeight: 600, textAlign: "center" },
  stepLine: { flex: 1, height: 2, background: "#2a2a2a", marginBottom: 18, transition: "background 0.3s ease" },
  stepLineDone: { background: "rgba(16,185,129,0.5)" },
  statusBox: { display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)", color: "#10B981", fontSize: 11 },
  statusDot: { width: 8, height: 8, borderRadius: 4, background: "#10B981", animation: "pulse 1.5s infinite" },
  infoCard: { padding: "14px 16px", borderRadius: 12, background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)" },
  infoTitle: { fontSize: 12, color: "#60A5FA", fontWeight: 700, marginBottom: 4 },
  infoText: { fontSize: 11, color: "#D1D5DB", lineHeight: 1.6 },
  btnRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
  btnSecondary: { padding: "12px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid #2a2a2a", color: "white", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnPrimary: { padding: "14px", borderRadius: 12, background: "linear-gradient(135deg, #FF6B35, #D97706)", border: "none", color: "#111", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" },
  btnGhost: { padding: "10px", background: "transparent", border: "none", color: "#9CA3AF", fontSize: 12, cursor: "pointer", fontFamily: "inherit" },
  footer: { marginTop: "auto", textAlign: "center", fontSize: 10, color: "#4B5563", letterSpacing: 1, padding: "12px 0" },
};
