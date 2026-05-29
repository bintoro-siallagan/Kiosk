import React, { useState, useEffect } from "react";
import API_HOST from "../apiBase.js";
import MarqueeTicker from "../components/MarqueeTicker.jsx";
import PromoStrip from "../components/PromoStrip.jsx";
import { fmtMoney as fIDR } from "../lib/currency.js";

const API = API_HOST;

export default function FlowHome({ session, tableContext, cartCount, cartTotal, onLogout, onNavigate }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/customers`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const list = data?.data || data?.customers || (Array.isArray(data) ? data : []);
        const phoneClean = (session.phone || "").replace(/[^0-9]/g, "");
        const phoneIntl = phoneClean.startsWith("0") ? "62" + phoneClean.substring(1) : phoneClean;

        const c = list.find(c => {
          const cp = (c.phone || "").replace(/[^0-9]/g, "");
          return cp === phoneClean || cp === phoneIntl ||
                 cp === phoneClean.substring(1) || cp.endsWith(phoneClean.substring(1));
        });

        setProfile(c || { phone: session.phone, name: session.name, points: 0, totalSpend: 0, tags: ["new"] });
      })
      .catch(() => setProfile({ phone: session.phone, name: session.name, points: 0, totalSpend: 0, tags: ["new"] }))
      .finally(() => setLoading(false));
  }, [session.phone]);

  const points = profile?.points || 0;
  const totalSpend = profile?.totalSpend || profile?.total_spend || 0;
  const visits = profile?.visits || 0;
  const tags = profile?.tags || ["new"];

  let tier = "Guest"; let tierColor = "#9CA3AF";
  if (tags.includes("vip")) { tier = "VIP ⭐"; tierColor = "var(--brand-primary,#FF6B35)"; }
  else if (tags.includes("member")) { tier = "Member 🎫"; tierColor = "#10B981"; }
  else if (tags.includes("new")) { tier = "Baru ✨"; tierColor = "#60A5FA"; }

  // fIDR comes from module import below; per-component shim no longer needed

  return (
    <div style={S.container}>
      {/* Text jalan — promo/sultan/coming soon/custom message */}
      <div style={{ margin: "0 -16px 4px" }}>
        <MarqueeTicker surface="flow" apiBase={API} variant="dark" height={34} speed={50} label="LIVE" />
      </div>
      <header style={S.header}>
        <div style={S.logo}>KaryaOS</div>
        <button onClick={onLogout} style={S.logoutBtn}>Logout</button>
      </header>

      {/* Promo banner — daftar promo F&B aktif, customer tap untuk salin kode */}
      <PromoStrip apiBase={API} variant="dark" maxItems={5} compact />

      <div style={S.profile}>
        {/* Sambutan hangat untuk customer kembali — time + continuity.
            Filosofi karyaOS: customer "pulang" ke flow, bukan masuk
            formulir. Mereka harus merasa diingat. */}
        {(() => {
          const h = new Date().getHours();
          const tgreet = h >= 5 && h < 11 ? 'Selamat pagi'
                       : h >= 11 && h < 15 ? 'Selamat siang'
                       : h >= 15 && h < 18 ? 'Selamat sore'
                       : 'Selamat malam';
          const name = profile?.name || session.name;
          const isNew = tags.includes("new") || visits === 0;
          return (
            <>
              <div style={S.greeting}>{tgreet}, {name}.</div>
              <div style={{
                fontSize: 13, color: 'rgba(255,255,255,0.62)', marginTop: 4,
                fontWeight: 400, letterSpacing: 0.1,
              }}>
                {isNew ? 'Senang Anda bergabung. Selamat menikmati.' :
                 visits === 1 ? 'Senang Anda kembali. Kunjungan kedua Anda.' :
                 `Senang lihat Anda lagi — kunjungan ke-${visits + 1}.`}
              </div>
            </>
          );
        })()}
        <div style={{ height: 12 }} />
        {tableContext ? (
          <div style={S.tableBadge}>📍 Meja {tableContext}</div>
        ) : (
          <div style={S.modeBadge}>🛍️ Bawa Pulang</div>
        )}

        <div style={S.statsRow}>
          <div style={S.statBox}>
            <div style={S.statLabel}>Poin</div>
            <div style={S.statValue}>{points.toLocaleString("id-ID")}</div>
            <div style={{...S.statBadge, color: tierColor}}>{tier}</div>
          </div>
          <div style={S.statBox}>
            <div style={S.statLabel}>Subtotal</div>
            <div style={S.statValue}>
              {totalSpend >= 1000000 ? `${(totalSpend / 1000000).toFixed(1)}` : Math.floor(totalSpend / 1000)}
              <span style={S.statUnit}>{totalSpend >= 1000000 ? "jt" : "rb"}</span>
            </div>
            <div style={S.statBadge}>{visits} kunjungan</div>
          </div>
        </div>
      </div>

      <div style={S.actionsGrid}>
        <ActionCard icon="🍽️" title="Pesan Sekarang" subtitle="Browse menu KaryaOS" accent="var(--brand-primary,#FF6B35)" onClick={() => onNavigate("menu")} />
        <ActionCard icon="🔁" title="Pesan Ulang" subtitle="Order favorit" accent="#10B981" comingSoon />
        <ActionCard icon="📦" title="Pesanan Aktif" subtitle="Track status pesanan" accent="#3B82F6" comingSoon />
        <ActionCard icon="🎁" title="Tukar Poin" subtitle={points >= 100 ? "Bisa redeem!" : "Min 100 poin"} accent="#8B5CF6" onClick={() => onNavigate("redeem")} />
        <ActionCard icon="🎉" title="Promo" subtitle="Promo aktif" accent="#EC4899" onClick={() => onNavigate("promos")} />
        <ActionCard icon="📜" title="History" subtitle={`${visits} order sebelumnya`} accent="#6366F1" onClick={() => onNavigate("history")} />
      </div>

      {cartCount > 0 && (
        <button className="flow-cart-floater" onClick={() => onNavigate("menu")} style={S.cartFloater}>
          <div style={S.cartFloaterLeft}>
            <span style={S.cartCount}>{cartCount}</span>
            <span>Continue Pesan</span>
          </div>
          <span style={S.cartFloaterTotal}>{fIDR(cartTotal)} →</span>
        </button>
      )}

      <div style={S.footer}>KaryaOS Flow · Mobile Order Portal</div>
    </div>
  );
}

function ActionCard({ icon, title, subtitle, accent, comingSoon, onClick }) {
  return (
    <button className="flow-action-card" onClick={comingSoon ? undefined : onClick} disabled={comingSoon} style={{ ...S.actionCard, ...(comingSoon ? { opacity: 0.5, cursor: "not-allowed" } : {}) }}>
      <div style={{ ...S.actionIcon, background: `${accent}15`, color: accent, border: `1px solid ${accent}30`, boxShadow: `0 4px 14px ${accent}1f, inset 0 1px 0 rgba(255,255,255,0.05)` }}>{icon}</div>
      <div style={S.actionTitle}>{title}</div>
      <div style={S.actionSub}>{subtitle}</div>
      {comingSoon && <div style={S.soonBadge}>Soon</div>}
    </button>
  );
}

const S = {
  container: { width: "min(440px, 100%)", minHeight: "100vh", padding: "20px 16px", display: "flex", flexDirection: "column", gap: 20, position: "relative" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 8 },
  logo: { fontFamily: "'Inter', sans-serif", fontSize: 26, fontWeight: 800, color: "var(--brand-primary,#FF6B35)", letterSpacing: "-0.5px" },
  logoutBtn: { padding: "7px 14px", borderRadius: 9, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.55)", fontSize: 11, cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1, textTransform: "uppercase", transition: "all 0.2s ease" },
  profile: {
    background: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.005))",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 18, padding: "22px 20px",
    boxShadow: "0 1px 2px rgba(0,0,0,0.3), 0 12px 32px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.04)",
    position: "relative", overflow: "hidden",
    backgroundImage: "radial-gradient(400px 200px at 80% 0%, rgba(245,158,11,0.08), transparent)",
    animation: "fadeUp 0.4s ease",
  },
  greeting: { fontSize: 19, fontWeight: 750, marginBottom: 10, letterSpacing: "-0.4px" },
  tableBadge: { display: "inline-block", padding: "5px 12px", borderRadius: 16, background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)", color: "var(--brand-primary,#FF6B35)", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, fontFamily: "'JetBrains Mono', monospace" },
  modeBadge: { display: "inline-block", padding: "5px 12px", borderRadius: 16, background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.25)", color: "#60A5FA", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, fontFamily: "'JetBrains Mono', monospace" },
  statsRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 18 },
  statBox: {
    background: "rgba(0,0,0,0.3)",
    backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 13, padding: "13px 15px",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
  },
  statLabel: { fontSize: 9.5, color: "rgba(255,255,255,0.45)", letterSpacing: 1.5, fontWeight: 600, marginBottom: 6, textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace" },
  statValue: { fontFamily: "'Inter', sans-serif", fontSize: 28, fontWeight: 800, color: "var(--brand-primary,#FF6B35)", lineHeight: 1, letterSpacing: "-1px" },
  statUnit: { fontSize: 13, color: "rgba(255,255,255,0.4)", marginLeft: 3, fontWeight: 600 },
  statBadge: { fontSize: 10, marginTop: 8, fontWeight: 600, letterSpacing: 0.3 },
  actionsGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  actionCard: {
    position: "relative", padding: "16px 14px", borderRadius: 15,
    background: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005))",
    border: "1px solid rgba(255,255,255,0.06)",
    color: "white", cursor: "pointer", fontFamily: "inherit", textAlign: "left",
    boxShadow: "0 1px 2px rgba(0,0,0,0.3), 0 6px 18px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.03)",
  },
  actionIcon: { width: 42, height: 42, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, marginBottom: 10 },
  actionTitle: { fontSize: 13, fontWeight: 750, letterSpacing: "-0.2px" },
  actionSub: { fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 3, lineHeight: 1.4 },
  soonBadge: { position: "absolute", top: 8, right: 8, padding: "2px 7px", borderRadius: 4, background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.25)", color: "var(--brand-primary,#FF6B35)", fontSize: 8, fontWeight: 700, letterSpacing: 1, fontFamily: "'JetBrains Mono', monospace" },
  footer: { textAlign: "center", fontSize: 9.5, color: "rgba(255,255,255,0.3)", letterSpacing: 2, padding: "14px 0", fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase" },
  cartFloater: {
    position: "sticky", bottom: 20, marginTop: "auto",
    width: "100%", padding: "15px 20px", borderRadius: 15,
    background: "linear-gradient(135deg, #FF6B35, #F59E0B)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#1a0f00",
    display: "flex", justifyContent: "space-between", alignItems: "center",
    fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
    letterSpacing: "-0.2px",
    boxShadow: "0 1px 2px rgba(0,0,0,0.3), 0 14px 32px rgba(255,107,53,0.4), inset 0 1px 0 rgba(255,255,255,0.2)",
    animation: "fadeUp 0.4s ease",
  },
  cartFloaterLeft: { display: "flex", alignItems: "center", gap: 10 },
  cartCount: {
    background: "rgba(0,0,0,0.25)", color: "#fff",
    width: 26, height: 26, borderRadius: 13,
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    fontSize: 13, fontWeight: 800,
    border: "1px solid rgba(255,255,255,0.15)",
  },
  cartFloaterTotal: { fontFamily: "'Inter', sans-serif", fontSize: 17, letterSpacing: "-0.3px", fontWeight: 800 },
};
