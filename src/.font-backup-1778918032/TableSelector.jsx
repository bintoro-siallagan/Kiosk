import { useState, useEffect } from "react";
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3011";

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
  root: { minHeight:"100vh", background:"#111", color:"#fff", fontFamily:"'Inter',sans-serif" },
  header: { display:"flex", alignItems:"center", justifyContent:"space-between",
    padding:"14px 24px", borderBottom:"1px solid #222", background:"#0a0a0a",
    position:"sticky", top:0, zIndex:10 },
  backBtn: { background:"transparent", border:"1px solid #333", color:"#aaa", padding:"8px 14px", borderRadius:8, fontSize:13, cursor:"pointer", fontFamily:"inherit" },
  title: { fontFamily:"'Inter',cursive", fontSize:32, letterSpacing:3, color:"#F59E0B", margin:0 },
  cancelBtn: { background:"transparent", border:"1px solid #444", color:"#aaa", padding:"8px 12px", borderRadius:8, fontSize:14, cursor:"pointer", fontFamily:"inherit", minWidth:36 },
  main: { maxWidth:1100, margin:"0 auto", padding:"32px 24px" },
  loading: { textAlign:"center", color:"#666", padding:60 },
  empty: { textAlign:"center", color:"#888", padding:60 },
  zoneSection: { marginBottom:32 },
  zoneTitle: { fontSize:12, color:"#888", letterSpacing:2, fontWeight:700, marginBottom:12, paddingLeft:4 },
  grid: { display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(140px, 1fr))", gap:12 },
  table: { background:"#1a1a1a", border:"2px solid #2a2a2a", borderRadius:14,
    padding:"20px 12px", color:"#fff", fontFamily:"inherit", cursor:"pointer",
    transition:"all 0.2s", display:"flex", flexDirection:"column", alignItems:"center", gap:4 },
  tableAvail: { borderColor:"#10B981" },
  tableOccupied: { borderColor:"#444", opacity:0.4, cursor:"not-allowed", background:"#0a0a0a" },
  tableId: { fontSize:10, color:"#666", letterSpacing:1, fontWeight:700 },
  tableName: { fontSize:18, fontWeight:700 },
  tableCap: { fontSize:11, color:"#888" },
  occupiedTag: { marginTop:6, fontSize:9, color:"#EF4444", fontWeight:700, letterSpacing:1,
    background:"rgba(239,68,68,0.1)", padding:"2px 8px", borderRadius:4 }
};
