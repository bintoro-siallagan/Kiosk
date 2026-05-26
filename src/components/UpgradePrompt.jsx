// UpgradePrompt.jsx — modal saat user klik modul yg ke-gate
// Show: feature name, plan minimum, CTA upgrade
import { requiredPlanFor } from "../adminModules.js";

const PLAN_INFO = {
  STARTER:    { name: "Starter",    price: "Rp 299k/mo", color: "#10b981" },
  GROWTH:     { name: "Growth",     price: "Rp 799k/mo", color: "#22d3ee" },
  PRO:        { name: "Pro",        price: "Rp 1.499k/mo", color: "#a855f7" },
  ENTERPRISE: { name: "Enterprise", price: "Rp 3.5M/mo",  color: "#fbbf24" },
};

export default function UpgradePrompt({ moduleId, moduleLabel, onClose, onUpgrade }) {
  const requiredPlan = requiredPlanFor(moduleId);
  const info = PLAN_INFO[requiredPlan] || PLAN_INFO.GROWTH;

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20, zIndex: 99999, backdropFilter: "blur(6px)",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "min(480px, 100%)",
        background: "rgba(10,15,28,0.96)",
        border: `1px solid ${info.color}55`,
        borderRadius: 18, padding: 28,
        boxShadow: `0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px ${info.color}22`,
        animation: "slideIn 0.25s",
      }}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 56, marginBottom: 6 }}>🔒</div>
          <div style={{ fontSize: 10, color: info.color, letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>FEATURE LOCKED</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", marginTop: 6 }}>{moduleLabel}</div>
        </div>

        <div style={{ padding: 16, background: `${info.color}11`, border: `1px solid ${info.color}44`, borderRadius: 12, textAlign: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6 }}>Upgrade ke plan</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: info.color, letterSpacing: -0.5 }}>{info.name}</div>
          <div style={{ fontSize: 14, color: "#fff", marginTop: 4, fontFamily: "'Geist Mono',monospace" }}>{info.price}</div>
        </div>

        <div style={{ fontSize: 12, color: "#cbd5e1", textAlign: "center", marginBottom: 18, lineHeight: 1.6 }}>
          Fitur ini bagian dari plan <b style={{ color: info.color }}>{info.name}</b>. Upgrade sekarang biar dapet akses penuh + fitur bonus lainnya.
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: 12, background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10,
            color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          }}>Nanti dulu</button>
          <button onClick={onUpgrade} style={{
            flex: 2, padding: 12,
            background: `linear-gradient(135deg, ${info.color}, ${info.color}cc)`,
            border: "none", borderRadius: 10, color: "#001",
            fontWeight: 800, cursor: "pointer", fontFamily: "inherit", letterSpacing: 0.3,
          }}>🚀 Lihat Plan</button>
        </div>
      </div>
    </div>
  );
}
