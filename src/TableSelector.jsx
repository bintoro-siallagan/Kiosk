import { useState, useEffect } from "react";
import API_HOST from "./apiBase.js";
const API_BASE = API_HOST;

export default function TableSelector({ onPick, onBack, onCancel }) {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/tables`)
      .then(r => r.json())
      .then(d => { setTables(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const zones = {};
  tables.forEach(t => {
    const z = t.zone || "Other";
    if (!zones[z]) zones[z] = [];
    zones[z].push(t);
  });

  return (
    <div style={S.root}>
      <header style={S.header}>
        <button onClick={onBack} style={S.backBtn}>← Back</button>
        <h2 style={S.title}>Pilih Meja</h2>
        <button onClick={onCancel} style={S.cancelBtn}>✕</button>
      </header>

      <main style={S.main}>
        {loading && <div style={S.loading}>Memuat meja...</div>}

        {!loading && tables.length === 0 && (
          <div style={S.empty}>
            <div style={{fontSize:60, marginBottom:12}}>🪑</div>
            <p>Belum ada meja terdaftar</p>
            <p style={{fontSize:12, color:"#555"}}>Tambah via Admin → Operasional → Meja</p>
          </div>
        )}

        {Object.keys(zones).sort().map(zone => (
          <section key={zone} style={S.zoneSection}>
            <h3 style={S.zoneTitle}>ZONE {zone}</h3>
            <div style={S.grid}>
              {zones[zone].map(t => {
                const isAvail = !t.status || t.status === "available";
                return (
                  <button
                    key={t.id}
                    onClick={() => isAvail && onPick(t)}
                    disabled={!isAvail}
                    style={{
                      ...S.table,
                      ...(isAvail ? S.tableAvail : S.tableOccupied)
                    }}
                    onMouseEnter={e => isAvail && (e.currentTarget.style.background = "#222")}
                    onMouseLeave={e => isAvail && (e.currentTarget.style.background = "#1a1a1a")}
                  >
                    <div style={S.tableId}>{t.id}</div>
                    <div style={S.tableName}>{t.name}</div>
                    <div style={S.tableCap}>{t.capacity || 4} pax</div>
                    {!isAvail && <div style={S.occupiedTag}>{(t.status || "").toUpperCase()}</div>}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}

const S = {
  root: {
    minHeight: "100vh",
    background: "radial-gradient(ellipse 70% 55% at 50% 38%, rgba(40,44,58,0.5) 0%, transparent 70%), linear-gradient(160deg,#08090f 0%,#11131c 50%,#1a1d29 100%)",
    backgroundAttachment: "fixed",
    color: "#fff", fontFamily: "'Inter',sans-serif",
  },
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "14px 24px",
    background: "rgba(13,17,23,0.7)",
    backdropFilter: "blur(20px) saturate(180%)",
    WebkitBackdropFilter: "blur(20px) saturate(180%)",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    position: "sticky", top: 0, zIndex: 10,
  },
  backBtn: {
    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.7)", padding: "7px 14px", borderRadius: 999,
    fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "'Inter',sans-serif", letterSpacing: "-0.1px",
  },
  title: {
    fontFamily: "'Inter',sans-serif",
    fontSize: 20, fontWeight: 600, letterSpacing: "-0.5px",
    color: "rgba(255,255,255,0.95)", margin: 0,
  },
  cancelBtn: {
    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.7)", padding: "7px 12px", borderRadius: 999,
    fontSize: 13, cursor: "pointer", fontFamily: "'Inter',sans-serif", minWidth: 36,
  },
  main: { maxWidth: 1100, margin: "0 auto", padding: "32px 24px" },
  loading: { textAlign: "center", color: "rgba(255,255,255,0.4)", padding: 60, fontSize: 14 },
  empty: { textAlign: "center", color: "rgba(255,255,255,0.4)", padding: 60, fontSize: 14 },
  zoneSection: { marginBottom: 28 },
  zoneTitle: {
    fontSize: 11, color: "rgba(255,255,255,0.45)", letterSpacing: 1.5, fontWeight: 500,
    marginBottom: 12, paddingLeft: 4, textTransform: "uppercase",
  },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 },
  // Liquid-glass table cards with brand-aware hover
  table: {
    background: "linear-gradient(180deg,rgba(255,255,255,0.05) 0%,rgba(255,255,255,0.02) 60%,rgba(255,255,255,0.008) 100%)",
    backdropFilter: "blur(20px) saturate(180%)",
    WebkitBackdropFilter: "blur(20px) saturate(180%)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 16,
    padding: "20px 12px", color: "#fff", fontFamily: "'Inter',sans-serif", cursor: "pointer",
    transition: "transform 0.25s cubic-bezier(.2,.8,.2,1), box-shadow 0.25s ease",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12), 0 4px 14px rgba(0,0,0,0.22)",
  },
  tableAvail: {
    borderColor: "color-mix(in srgb, #10B981 38%, transparent)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12), 0 4px 14px rgba(16,185,129,0.18)",
  },
  tableOccupied: {
    borderColor: "rgba(255,255,255,0.04)", opacity: 0.45, cursor: "not-allowed",
    background: "rgba(255,255,255,0.015)",
  },
  tableId: { fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: 0.8, fontWeight: 500, textTransform: "uppercase" },
  tableName: { fontSize: 18, fontWeight: 600, color: "rgba(255,255,255,0.95)", letterSpacing: "-0.3px" },
  tableCap: { fontSize: 11, color: "rgba(255,255,255,0.45)" },
  occupiedTag: {
    marginTop: 6, fontSize: 9, color: "#FCA5A5", fontWeight: 500, letterSpacing: 0.5,
    background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.22)",
    padding: "2px 8px", borderRadius: 999, textTransform: "uppercase",
  }
};
