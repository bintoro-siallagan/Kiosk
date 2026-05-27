import { useState, useEffect } from "react";
import API_HOST from "./apiBase.js";

const API_BASE = API_HOST;

export default function POSLogin({ onLogin }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [brand, setBrand] = useState({ name: null, code: null });

  useEffect(() => {
    fetch(`${API_BASE}/api/auth/users`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => {
        const list = Array.isArray(data) ? data : (data?.users || []);
        setUsers(list);
        setLoading(false);
      })
      .catch(err => { setError(err.message); setLoading(false); });
    fetch(`${API_BASE}/api/companies/branding`)
      .then(r => r.json()).then(b => {
        if (b?.brand_color) {
          setBrand({ name: b.name, code: b.company_code });
          const root = document.documentElement;
          root.style.setProperty("--brand-primary", b.brand_color);
          root.style.setProperty("--brand-secondary", b.brand_secondary || b.brand_color);
          // Contrast-aware text color (white on dark brand, dark on light brand)
          try {
            const hex = String(b.brand_color || "#FF6B35").replace("#", "");
            const rgb = hex.length === 3 ? hex.split("").map(c => parseInt(c + c, 16)) : hex.match(/.{2}/g).map(h => parseInt(h, 16));
            const [R, G, B] = rgb.map(c => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
            const lum = 0.2126 * R + 0.7152 * G + 0.0722 * B;
            root.style.setProperty("--brand-text", lum > 0.55 ? "#0a0e16" : "#ffffff");
          } catch { root.style.setProperty("--brand-text", "#ffffff"); }
        }
      }).catch(() => {});
  }, []);

  const PLATFORM = ["BTS", "CMX", "KARYAOS"];
  const isPlatform = !brand.code || PLATFORM.includes(brand.code);
  const brandLabel = isPlatform ? "karyaos" : brand.name;

  return (
    <div style={S.root}>
      <style>{LOGIN_CSS}</style>
      <header style={S.header}>
        <img src="/logo.png" alt="" className="boot-logo-mini"
          style={{ width: 64, height: 64, objectFit: "contain", marginBottom: 12 }} />
        <h1 style={S.title}>
          {isPlatform
            ? <>karya<span style={{ fontWeight: 300, opacity: 0.55 }}>os</span> <span style={S.titleSub}>POS</span></>
            : <>{brandLabel} <span style={S.titleSub}>POS</span></>}
        </h1>
        <p style={S.subtitle}>Point of Sale Terminal</p>
      </header>

      <section style={S.section}>
        <h2 style={S.sectionTitle}>Select cashier to begin</h2>

        {loading && <div style={S.loading}>⏳ Loading...</div>}

        {error && (
          <div className="lg" style={S.error}>⚠ Cashier data unavailable. Please try again.</div>
        )}

        {!loading && !error && users.length === 0 && (
          <div className="lg" style={S.empty}>
            <div style={{ fontSize: 56, marginBottom: 12, opacity: 0.4 }}>👤</div>
            <p style={{ margin: "0 0 6px", fontSize: 15, color: "rgba(255,255,255,0.8)", fontWeight: 500 }}>No cashier registered</p>
            <p style={S.hint}>Add a user via <a href="?admin" style={S.link}>Admin → Users</a></p>
          </div>
        )}

        {!loading && users.length > 0 && (
          <div style={S.grid}>
            {users.map(u => {
              const role = (u.role || "kasir").toLowerCase();
              return (
                <button
                  key={u.id}
                  onClick={() => onLogin(u)}
                  className="lg user-card"
                  style={S.card}
                >
                  <div style={S.avatar}>👤</div>
                  <div style={S.name}>{u.name || "Unnamed"}</div>
                  <div style={{ ...S.role, background: roleColors[role] || roleColors.kasir }}>
                    {(u.role || "kasir")}
                  </div>
                  <div style={S.cta}>Select →</div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <footer style={S.footer}>
        <a href="?" style={S.backLink}>← Back to Kiosk</a>
      </footer>
    </div>
  );
}

const roleColors = {
  admin: "linear-gradient(180deg,#EF4444,#dc2626)",
  manager: "linear-gradient(180deg,#A855F7,#9333ea)",
  kasir: "linear-gradient(180deg,#3B82F6,#2563eb)",
  staff: "linear-gradient(180deg,#10B981,#059669)"
};

const LOGIN_CSS = `
  :root{color-scheme:dark}
  *{box-sizing:border-box;margin:0;padding:0}
  @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  @keyframes bootGlow{
    0%,100%{filter:brightness(0.94) drop-shadow(0 0 6px rgba(255,255,255,0.45)) drop-shadow(0 0 18px rgba(255,255,255,0.22)) drop-shadow(0 0 40px var(--brand-primary,#FF6B35))}
    50%{filter:brightness(1.02) drop-shadow(0 0 9px rgba(255,255,255,0.6)) drop-shadow(0 0 26px rgba(255,255,255,0.32)) drop-shadow(0 0 60px var(--brand-primary,#FF6B35))}
  }
  .boot-logo-mini{animation:bootGlow 5.5s ease-in-out infinite}
  .lg{
    position:relative;
    background:linear-gradient(180deg,rgba(255,255,255,0.06) 0%,rgba(255,255,255,0.02) 60%,rgba(255,255,255,0.008) 100%);
    backdrop-filter:blur(28px) saturate(180%);-webkit-backdrop-filter:blur(28px) saturate(180%);
    border:1px solid rgba(255,255,255,0.07);
    box-shadow:inset 0 1px 0 rgba(255,255,255,0.16),inset 0 -1px 0 rgba(0,0,0,0.18),0 8px 24px rgba(0,0,0,0.28),0 24px 60px rgba(0,0,0,0.32);
    overflow:hidden;
  }
  .user-card{transition:transform .3s cubic-bezier(.2,.8,.2,1),box-shadow .3s ease;animation:fadeIn .4s ease both}
  .user-card:hover{transform:translateY(-3px);box-shadow:inset 0 1px 0 rgba(255,255,255,0.22),inset 0 -1px 0 rgba(0,0,0,0.18),0 12px 32px rgba(0,0,0,0.34),0 30px 80px color-mix(in srgb,var(--brand-primary,#FF6B35) 22%,transparent)}
  .user-card:active{transform:translateY(-1px) scale(.99)}
`;

const S = {
  root: {
    minHeight: "100vh",
    background: "radial-gradient(ellipse 60% 50% at 30% 20%, rgba(70,76,98,0.45) 0%, transparent 65%), radial-gradient(ellipse 55% 45% at 75% 80%, rgba(50,55,72,0.35) 0%, transparent 65%), linear-gradient(160deg,#12141c 0%,#181b25 50%,#22253a 100%)",
    backgroundAttachment: "fixed",
    color: "#fff",
    fontFamily: "'Inter',sans-serif",
    padding: "56px 24px 32px",
    display: "flex", flexDirection: "column"
  },
  header: { textAlign: "center", marginBottom: 48 },
  title: {
    fontFamily: "'Inter',sans-serif",
    fontSize: 44, fontWeight: 600, letterSpacing: "-1.5px",
    margin: "8px 0 8px", color: "#fff",
    background: "linear-gradient(180deg,#fff 0%,rgba(255,255,255,0.65) 100%)",
    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
    display: "inline-flex", alignItems: "baseline", gap: 14, justifyContent: "center"
  },
  titleSub: {
    fontSize: 18, color: "rgba(255,255,255,0.4)", fontWeight: 500, letterSpacing: 4,
    WebkitTextFillColor: "rgba(255,255,255,0.4)", textTransform: "uppercase"
  },
  subtitle: { fontSize: 12, color: "rgba(255,255,255,0.4)", margin: 0, letterSpacing: 3, fontWeight: 400 },
  section: { maxWidth: 1100, width: "100%", margin: "0 auto", flex: 1 },
  sectionTitle: {
    fontSize: 14, color: "rgba(255,255,255,0.55)", textAlign: "center",
    marginBottom: 28, fontWeight: 500, letterSpacing: "-0.2px"
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 16
  },
  card: {
    borderRadius: 20, padding: "30px 22px",
    color: "#fff", fontFamily: "inherit",
    cursor: "pointer", border: "none",
    textAlign: "center",
    display: "flex", flexDirection: "column",
    alignItems: "center", gap: 12
  },
  avatar: { fontSize: 48, opacity: 0.8, filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.3))" },
  name: { fontSize: 18, fontWeight: 600, color: "rgba(255,255,255,0.95)", letterSpacing: "-0.3px" },
  role: {
    color: "#fff", padding: "4px 12px",
    borderRadius: 999, fontSize: 10,
    fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22)"
  },
  cta: {
    marginTop: 6, color: "rgba(255,255,255,0.55)",
    fontSize: 12, fontWeight: 500, letterSpacing: "-0.1px"
  },
  loading: { textAlign: "center", color: "rgba(255,255,255,0.45)", padding: 60, fontSize: 14 },
  error: {
    color: "#FCA5A5", padding: "14px 18px", borderRadius: 14,
    marginBottom: 20, textAlign: "center", fontSize: 13, fontWeight: 500
  },
  empty: {
    textAlign: "center", color: "rgba(255,255,255,0.6)",
    padding: "44px 24px", borderRadius: 18
  },
  hint: { fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 8 },
  link: { color: "rgba(255,255,255,0.7)", textDecoration: "underline" },
  footer: { textAlign: "center", marginTop: 32 },
  backLink: { color: "rgba(255,255,255,0.35)", fontSize: 12, textDecoration: "none", letterSpacing: "-0.1px" }
};
