import React, { useEffect, useState, useRef } from "react";
import API_HOST from "../apiBase.js";
import POSCelebration from "../POS/POSCelebration.jsx";
import { subscribeToOrderPush, isPushSupported } from "../lib/push.js";
import PushPermissionPrompt from "../components/PushPermissionPrompt.jsx";

const API = API_HOST;
import { fmtMoney as fIDR } from "../lib/currency.js";

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

  // If browser permission already granted, subscribe silently for this order.
  // For 'default' (not yet decided), the PushPermissionPrompt component
  // renders an in-app pre-prompt and drives the subscribe on user opt-in.
  useEffect(() => {
    if (!isPushSupported()) return;
    if (Notification.permission !== "granted") return;
    subscribeToOrderPush({ orderId: order.id, phone: session?.phone }).catch(() => {});
  }, [order.id, session?.phone]);

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
        {/* Eyebrow */}
        <div style={{
          fontSize: 10, color: "color-mix(in srgb,var(--brand-primary,#FF6B35) 90%,#fff)",
          fontFamily: "'Geist Mono',monospace", fontWeight: 800, letterSpacing: 2.5,
          textTransform: "uppercase", marginBottom: 4,
          display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "center",
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: "var(--brand-primary,#FF6B35)",
            boxShadow: "0 0 8px var(--brand-primary,#FF6B35)",
            animation: "pulse 1.6s ease infinite",
          }} />
          ORDER NUMBER
        </div>
        <div style={S.orderId}>#{order.id}</div>
        <div style={S.orderTotal}>{fIDR(orderData.total || order.total)}</div>
        <div style={S.orderMeta}>
          {(orderData.type || order.type) === "dine" ? `🍽 Dine In · Meja ${orderData.table || order.table || "-"}` : "🛍 Bawa Pulang"}
        </div>
        {currentStep < 2 && (
          <div style={{
            marginTop: 12, padding: "6px 14px",
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 999, backdropFilter: "blur(8px)",
            fontSize: 12, color: "#fff", fontWeight: 700, fontFamily: "'Geist Mono',monospace",
          }}>
            <span style={{ color: "#10b981" }}>●</span>
            <span style={{ color: "color-mix(in srgb,var(--brand-primary,#FF6B35) 90%,#fff)" }}>EST. 4 MENIT</span>
          </div>
        )}
      </div>

      <PushPermissionPrompt orderId={order.id} phone={session?.phone} />

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
  // PREMIUM celebration — bigger success icon dgn glow halo
  successIcon: { fontSize: 92, animation: "successPop 0.6s cubic-bezier(.34,1.56,.64,1)", marginBottom: 24, filter: "drop-shadow(0 0 24px color-mix(in srgb,var(--brand-primary,#FF6B35) 50%,transparent))" },
  title: { fontSize: "clamp(26px, 5vw, 32px)", fontWeight: 900, marginTop: 8, letterSpacing: -0.6, textShadow: "0 0 24px color-mix(in srgb,var(--brand-primary,#FF6B35) 30%,transparent)" },
  subtitle: { fontSize: 14, color: "#9CA3AF", marginTop: 6, padding: "0 20px", fontFamily: "'Geist Mono',monospace", letterSpacing: 0.4 },
  // PICKUP HERO order card — BIG # mono + brand drama
  orderCard: { padding: "28px 22px", borderRadius: 20, background: "linear-gradient(135deg, color-mix(in srgb,var(--brand-primary,#FF6B35) 16%,transparent), color-mix(in srgb,var(--brand-primary,#FF6B35) 4%,transparent))", border: "1px solid color-mix(in srgb,var(--brand-primary,#FF6B35) 40%,transparent)", textAlign: "center", boxShadow: "0 8px 32px color-mix(in srgb,var(--brand-primary,#FF6B35) 20%,rgba(0,0,0,0.4)), inset 0 1px 0 rgba(255,255,255,0.06)" },
  orderId: { fontFamily: "'Geist Mono',monospace", fontSize: "clamp(56px, 12vw, 92px)", fontWeight: 900, color: "var(--brand-primary,#FF6B35)", letterSpacing: -3, lineHeight: 1, textShadow: "0 4px 24px color-mix(in srgb,var(--brand-primary,#FF6B35) 50%,transparent)" },
  orderTotal: { fontSize: 22, fontWeight: 800, marginTop: 10, fontFamily: "'Geist Mono',monospace", letterSpacing: -0.5, color: "#fff" },
  orderMeta: { fontSize: 11, color: "color-mix(in srgb,var(--brand-primary,#FF6B35) 80%,#fff)", marginTop: 8, fontFamily: "'Geist Mono',monospace", letterSpacing: 1, fontWeight: 700, textTransform: "uppercase" },
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
  btnPrimary: { padding: "14px", borderRadius: 12,
    background: "radial-gradient(ellipse 90% 180% at 50% 100%, color-mix(in srgb, var(--brand-primary,#FF6B35) 60%, transparent), transparent 55%), linear-gradient(180deg, color-mix(in srgb, var(--brand-primary,#FF6B35) 38%, #1a1d29), color-mix(in srgb, var(--brand-secondary,#E55A2B) 30%, #0d0f14))",
    border: "1px solid rgba(255,255,255,0.16)",
    color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,0.45)",
    fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22), 0 8px 24px color-mix(in srgb, var(--brand-primary,#FF6B35) 25%, transparent)" },
  btnGhost: { padding: "10px", background: "transparent", border: "none", color: "#9CA3AF", fontSize: 12, cursor: "pointer", fontFamily: "inherit" },
  footer: { marginTop: "auto", textAlign: "center", fontSize: 10, color: "#4B5563", letterSpacing: 1, padding: "12px 0" },
};
