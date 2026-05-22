export default function OrderTypePicker({ onPick, onCancel }) {
  return (
    <div style={S.root}>
      <div style={S.card}>
        <h1 style={S.title}>Pilih Tipe Order</h1>
        <p style={S.subtitle}>Bagaimana customer akan menikmati pesanan?</p>

        <div style={S.grid}>
          <button onClick={() => onPick("dine-in")} style={S.option}
            onMouseEnter={e => e.currentTarget.style.borderColor = "#F59E0B"}
            onMouseLeave={e => e.currentTarget.style.borderColor = "#2a2a2a"}>
            <div style={S.icon}>🍽️</div>
            <div style={S.optionTitle}>Dine-in</div>
            <div style={S.optionHint}>Makan di restoran</div>
          </button>
          <button onClick={() => onPick("take-away")} style={S.option}
            onMouseEnter={e => e.currentTarget.style.borderColor = "#F59E0B"}
            onMouseLeave={e => e.currentTarget.style.borderColor = "#2a2a2a"}>
            <div style={S.icon}>🛍️</div>
            <div style={S.optionTitle}>Take-away</div>
            <div style={S.optionHint}>Bawa pulang</div>
          </button>
        </div>

        <button onClick={onCancel} style={S.cancelLink}>✕ Batalkan Order</button>
      </div>
    </div>
  );
}

const S = {
  root: { minHeight:"100vh", background:"#111", color:"#fff", fontFamily:"'Plus Jakarta Sans',sans-serif",
    display:"flex", alignItems:"center", justifyContent:"center", padding:24 },
  card: { maxWidth:700, width:"100%", textAlign:"center" },
  title: { fontFamily:"'Montserrat',sans-serif", fontSize:"min(52px,11vw)", letterSpacing:4, margin:"0 0 8px", color:"#F59E0B", whiteSpace:"nowrap" },
  subtitle: { color:"#888", fontSize:16, marginBottom:48 },
  grid: { display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:20, marginBottom:32 },
  option: { background:"#1a1a1a", border:"2px solid #2a2a2a", borderRadius:20, padding:"48px 24px",
    color:"#fff", fontFamily:"inherit", cursor:"pointer", transition:"all 0.2s",
    display:"flex", flexDirection:"column", alignItems:"center", gap:12 },
  icon: { fontSize:80, marginBottom:8 },
  optionTitle: { fontSize:24, fontWeight:700 },
  optionHint: { fontSize:13, color:"#888" },
  cancelLink: { background:"transparent", border:"none", color:"#666", fontSize:13, cursor:"pointer", fontFamily:"inherit", padding:12 }
};
