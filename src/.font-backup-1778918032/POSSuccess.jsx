export default function POSSuccess({ created, order, cashier, onDone, onAnother }) {
  const isPay = order.action === "pay";
  const fmt = (n) => (n || 0).toLocaleString("id-ID");

  return (
    <div style={S.root}>
      <div style={S.card}>
        <div style={S.icon}>{isPay ? "✅" : "📋"}</div>

        <h1 style={S.title}>
          {isPay ? "PEMBAYARAN BERHASIL" : "TAB DIBUKA"}
        </h1>

        <div style={S.orderId}>Order #{created?.id || "?"}</div>

        <div style={S.details}>
          <div style={S.detailRow}>
            <span style={S.detailLabel}>Tipe</span>
            <span>{order.type === "dine-in" ? "🍽️ Dine-in" : "🛍️ Take-away"}</span>
          </div>
          {order.table && (
            <div style={S.detailRow}>
              <span style={S.detailLabel}>Meja</span>
              <span>{order.table.name}</span>
            </div>
          )}
          {order.customerName && (
            <div style={S.detailRow}>
              <span style={S.detailLabel}>Customer</span>
              <span>{order.customerName}</span>
            </div>
          )}
          <div style={S.detailRow}>
            <span style={S.detailLabel}>Status</span>
            <span style={isPay ? S.statusPaid : S.statusTab}>
              {isPay ? "💵 Dibayar (Cash)" : "📋 Open Tab"}
            </span>
          </div>
          <div style={S.detailRow}>
            <span style={S.detailLabel}>Total</span>
            <span style={S.detailTotal}>Rp {fmt(created?.total || order.subtotal)}</span>
          </div>
        </div>

        <div style={S.actions}>
          <button onClick={onAnother} style={S.anotherBtn}>+ Order Lagi</button>
          <button onClick={onDone} style={S.doneBtn}>← Kembali ke Home</button>
        </div>

        <div style={S.hint}>
          {isPay
            ? "Pesanan akan diproses oleh dapur."
            : "Klik tab di POSHome untuk settle pembayaran nanti."}
        </div>
      </div>
    </div>
  );
}

const S = {
  root: { minHeight:"100vh", background:"#111", color:"#fff", fontFamily:"'Inter',sans-serif",
    display:"flex", alignItems:"center", justifyContent:"center", padding:24 },
  card: { maxWidth:560, width:"100%", textAlign:"center" },
  icon: { fontSize:96, marginBottom:8 },
  title: { fontFamily:"'Inter',cursive", fontSize:48, letterSpacing:3,
    color:"#F59E0B", margin:"0 0 8px" },
  orderId: { fontSize:14, color:"#888", letterSpacing:3, marginBottom:32, fontWeight:600 },
  details: { background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:14,
    padding:"20px 24px", marginBottom:24, textAlign:"left" },
  detailRow: { display:"flex", justifyContent:"space-between", padding:"10px 0",
    borderBottom:"1px solid #222", fontSize:14 },
  detailLabel: { color:"#888" },
  statusPaid: { color:"#10B981", fontWeight:700 },
  statusTab: { color:"#F59E0B", fontWeight:700 },
  detailTotal: { fontFamily:"'Inter',cursive", fontSize:24, color:"#F59E0B", letterSpacing:1 },
  actions: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:20 },
  anotherBtn: { background:"#F59E0B", color:"#111", border:"none", borderRadius:12,
    padding:"14px", fontFamily:"inherit", fontSize:14, fontWeight:700, cursor:"pointer" },
  doneBtn: { background:"transparent", color:"#aaa", border:"1px solid #444", borderRadius:12,
    padding:"14px", fontFamily:"inherit", fontSize:14, fontWeight:600, cursor:"pointer" },
  hint: { fontSize:12, color:"#555", marginTop:8 }
};
