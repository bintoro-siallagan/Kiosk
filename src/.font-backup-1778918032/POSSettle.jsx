import { useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3011";

export default function POSSettle({ tab, cashier, onBack, onSuccess }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const fmt = (n) => (n || 0).toLocaleString("id-ID");
  const items = tab.items || [];

  const handleSettle = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/orders/${tab.id}/settle`, {
        method: "PATCH",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ pay: "CASH" })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const settled = await res.json();
      onSuccess(settled);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <div style={S.root}>
      <header style={S.header}>
        <button onClick={onBack} style={S.backBtn} disabled={submitting}>← Back</button>
        <h2 style={S.title}>Settle Tab #{tab.id}</h2>
        <span style={S.statusPill}>📋 OPEN TAB</span>
      </header>

      <main style={S.main}>
        <div style={S.contextBox}>
          <div style={S.contextRow}>
            <span style={S.label}>Tipe</span>
            <span style={S.value}>{tab.type === "dine" ? "🍽️ Dine-in" : "🛍️ Take-away"}</span>
          </div>
          {tab.table && tab.table !== "-" && (
            <div style={S.contextRow}>
              <span style={S.label}>Meja</span>
              <span style={S.value}>{tab.table}</span>
            </div>
          )}
          {tab.customer_name && (
            <div style={S.contextRow}>
              <span style={S.label}>Customer</span>
              <span style={S.value}>{tab.customer_name}</span>
            </div>
          )}
          <div style={S.contextRow}>
            <span style={S.label}>Dibuka oleh</span>
            <span style={S.value}>👤 {tab.kasir || "?"}</span>
          </div>
          <div style={S.contextRow}>
            <span style={S.label}>Settle oleh</span>
            <span style={S.value}>👤 {cashier.name}</span>
          </div>
        </div>

        <div style={S.cartList}>
          <h3 style={S.sectionTitle}>Pesanan ({items.length} item)</h3>
          {items.map((it, i) => (
            <div key={i} style={S.cartRow}>
              <div style={S.cartLeft}>
                <span style={S.cartEmoji}>{it.e || "🍴"}</span>
                <div>
                  <div style={S.cartName}>{it.n}</div>
                  <div style={S.cartSubprice}>Rp {fmt(it.p)} × {it.q}</div>
                </div>
              </div>
              <div style={S.cartLineTotal}>Rp {fmt((it.p || 0) * (it.q || 1))}</div>
            </div>
          ))}
        </div>

        <div style={S.totalBox}>
          <div style={S.totalRow}>
            <span>Total</span>
            <span style={S.totalAmount}>Rp {fmt(tab.total)}</span>
          </div>
          <div style={S.taxNote}>PPN 10% included</div>
        </div>

        <div style={S.payInfo}>
          <div style={S.payLabel}>💵 Metode Pembayaran</div>
          <div style={S.payValue}>CASH (default)</div>
          <div style={S.payHint}>Cash/QRIS picker → Step 5b</div>
        </div>

        {error && <div style={S.error}>⚠ {error}</div>}

        <button onClick={handleSettle} disabled={submitting} style={S.submitBtn}>
          {submitting ? "⏳ Menyimpan..." : "✓ Settle as CASH"}
        </button>
      </main>
    </div>
  );
}

const S = {
  root: { minHeight:"100vh", background:"#111", color:"#fff", fontFamily:"'DM Sans',sans-serif" },
  header: { display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 24px",
    borderBottom:"1px solid #222", background:"#0a0a0a", position:"sticky", top:0, zIndex:10 },
  backBtn: { background:"transparent", border:"1px solid #333", color:"#aaa",
    padding:"8px 14px", borderRadius:8, fontSize:13, cursor:"pointer", fontFamily:"inherit" },
  title: { fontFamily:"'Bebas Neue',cursive", fontSize:24, letterSpacing:2, color:"#F59E0B", margin:0 },
  statusPill: { background:"rgba(245,158,11,0.15)", color:"#F59E0B", padding:"6px 12px",
    borderRadius:100, fontSize:11, fontWeight:700, letterSpacing:1 },
  main: { maxWidth:640, margin:"0 auto", padding:"24px 20px" },
  contextBox: { background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:12, padding:16, marginBottom:16 },
  contextRow: { display:"flex", justifyContent:"space-between", padding:"6px 0",
    borderBottom:"1px solid #222", fontSize:14 },
  label: { color:"#888" },
  value: { color:"#fff", fontWeight:600 },
  cartList: { background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:12, padding:16, marginBottom:16 },
  sectionTitle: { fontSize:13, color:"#888", letterSpacing:1, fontWeight:700, margin:"0 0 12px", textTransform:"uppercase" },
  cartRow: { display:"flex", justifyContent:"space-between", alignItems:"center",
    padding:"10px 0", borderBottom:"1px solid #222" },
  cartLeft: { display:"flex", alignItems:"center", gap:12 },
  cartEmoji: { fontSize:24 },
  cartName: { fontSize:14, fontWeight:600 },
  cartSubprice: { fontSize:11, color:"#888", marginTop:2 },
  cartLineTotal: { fontSize:14, fontWeight:700, color:"#F59E0B" },
  totalBox: { background:"#1a1a1a", border:"1px solid #F59E0B", borderRadius:12, padding:16, marginBottom:16 },
  totalRow: { display:"flex", justifyContent:"space-between", alignItems:"center" },
  totalAmount: { fontFamily:"'Bebas Neue',cursive", fontSize:32, color:"#F59E0B", letterSpacing:2 },
  taxNote: { fontSize:10, color:"#555", marginTop:2 },
  payInfo: { background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:12, padding:14, marginBottom:16 },
  payLabel: { fontSize:11, color:"#888", letterSpacing:1, fontWeight:700 },
  payValue: { fontSize:18, fontWeight:700, color:"#10B981", marginTop:4 },
  payHint: { fontSize:10, color:"#555", marginTop:4 },
  error: { background:"#1a1a1a", border:"1px solid #EF4444", color:"#FCA5A5",
    padding:14, borderRadius:10, marginBottom:16, fontSize:13 },
  submitBtn: { width:"100%", background:"#10B981", color:"#fff", border:"none", borderRadius:14,
    padding:"18px", fontFamily:"inherit", fontSize:16, fontWeight:800, letterSpacing:1.5,
    cursor:"pointer", boxShadow:"0 4px 16px rgba(16,185,129,0.3)" }
};
