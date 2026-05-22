import { useState, useEffect } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3011";

export default function POSLogin({ onLogin }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/auth/users`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => {
        const list = Array.isArray(data) ? data : (data?.users || []);
        setUsers(list);
        setLoading(false);
      })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  return (
    <div style={S.root}>
      <header style={S.header}>
        <img src="/logo.png" alt="KaryaOS" style={{ width: 72, height: 72, objectFit: "contain", marginBottom: 8 }} />
        <h1 style={S.title}>KaryaOS POS</h1>
        <p style={S.subtitle}>POINT OF SALE TERMINAL</p>
      </header>

      <section style={S.section}>
        <h2 style={S.sectionTitle}>Pilih Kasir untuk Memulai</h2>

        {loading && <div style={S.loading}>☕ Memuat...</div>}

        {error && (
          <div style={S.error}>⚠ Gagal memuat user: {error}</div>
        )}

        {!loading && !error && users.length === 0 && (
          <div style={S.empty}>
            <div style={{fontSize: 60, marginBottom: 12}}>👤</div>
            <p style={{margin: "0 0 4px", fontSize: 16}}>Belum ada kasir terdaftar</p>
            <p style={S.hint}>Tambah user via <a href="?admin" style={S.link}>Admin → User Admin</a></p>
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
                  style={S.card}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "#F59E0B"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "#2a2a2a"; e.currentTarget.style.transform = "translateY(0)"; }}
                >
                  <div style={S.avatar}>👤</div>
                  <div style={S.name}>{u.name || "Unnamed"}</div>
                  <div style={{...S.role, background: roleColors[role] || roleColors.kasir}}>
                    {(u.role || "kasir").toUpperCase()}
                  </div>
                  <div style={S.cta}>► PILIH</div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <footer style={S.footer}>
        <a href="?" style={S.backLink}>← Kembali ke Kiosk</a>
      </footer>
    </div>
  );
}

const roleColors = {
  admin:   "#EF4444",
  manager: "#A855F7",
  kasir:   "#3B82F6",
  staff:   "#10B981"
};

const S = {
  root: {
    minHeight: "100vh", background: "#111", color: "#fff",
    fontFamily: "'Inter',sans-serif",
    padding: "48px 24px",
    display: "flex", flexDirection: "column"
  },
  header: { textAlign: "center", marginBottom: 48 },
  title: {
    fontFamily: "'Inter',sans-serif",
    fontSize: 72, letterSpacing: 5,
    margin: "0 0 4px", color: "#F59E0B"
  },
  subtitle: { fontSize: 12, color: "#888", margin: 0, letterSpacing: 4, fontWeight: 600 },
  section: { maxWidth: 1100, width: "100%", margin: "0 auto", flex: 1 },
  sectionTitle: {
    fontSize: 18, color: "#aaa", textAlign: "center",
    marginBottom: 32, fontWeight: 500, letterSpacing: 1
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 20
  },
  card: {
    background: "#1a1a1a", border: "2px solid #2a2a2a",
    borderRadius: 16, padding: "32px 20px",
    color: "#fff", fontFamily: "inherit",
    cursor: "pointer", transition: "all 0.2s",
    textAlign: "center",
    display: "flex", flexDirection: "column",
    alignItems: "center", gap: 12
  },
  avatar: { fontSize: 56, opacity: 0.9 },
  name: { fontSize: 22, fontWeight: 700, color: "#fff" },
  role: {
    color: "#fff", padding: "4px 14px",
    borderRadius: 100, fontSize: 11,
    fontWeight: 700, letterSpacing: 1.5
  },
  cta: {
    marginTop: 8, color: "#F59E0B",
    fontSize: 13, fontWeight: 700, letterSpacing: 1.5
  },
  loading: { textAlign: "center", color: "#666", padding: 60 },
  error: {
    background: "#1a1a1a", border: "1px solid #EF4444",
    color: "#FCA5A5", padding: 16, borderRadius: 10,
    marginBottom: 20, textAlign: "center"
  },
  empty: {
    textAlign: "center", color: "#888",
    padding: "60px 20px",
    background: "#1a1a1a", borderRadius: 16,
    border: "1px dashed #2a2a2a"
  },
  hint: { fontSize: 13, color: "#666", marginTop: 8 },
  link: { color: "#F59E0B", textDecoration: "none" },
  footer: { textAlign: "center", marginTop: 48 },
  backLink: { color: "#555", fontSize: 13, textDecoration: "none" }
};
