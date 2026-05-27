import { useState } from "react";
import { validateCustomerName } from "./lib/nameValidator.js";

export default function CustomerNameInput({ order, onContinue, onBack, onCancel }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  // Live validation — but only show error kalau user udah ketik
  const validation = name ? validateCustomerName(name) : { valid: true, error: null };

  const handleContinue = (rawName) => {
    if (!rawName) return onContinue("");  // skip OK
    const v = validateCustomerName(rawName);
    if (!v.valid) { setError(v.error); return; }
    setError("");
    onContinue(v.cleaned);
  };

  return (
    <div style={S.root}>
      <header style={S.header}>
        <button onClick={onBack} style={S.backBtn}>← Back</button>
        <button onClick={onCancel} style={S.cancelBtn}>✕</button>
      </header>

      <main style={S.main}>
        <div style={S.summary}>
          {order.type === "dine-in" ? "🍽️ Dine-in" : "🛍️ Take-away"}
          {order.table && ` · ${order.table.name} (${order.table.capacity || 4} pax)`}
        </div>

        <h1 style={S.title}>Nama Customer</h1>
        <p style={S.subtitle}>Opsional — untuk panggil pesanan saat siap</p>

        <input
          type="text"
          autoFocus
          value={name}
          onChange={(e) => { setName(e.target.value); setError(""); }}
          placeholder="Mis: Budi, Sarah..."
          style={{ ...S.input, borderColor: (error || (name && !validation.valid)) ? "#ef4444" : "#2a2a2a" }}
          onKeyDown={(e) => e.key === "Enter" && handleContinue(name.trim())}
        />
        {(error || (name && !validation.valid)) && (
          <div style={{ color: "#fca5a5", fontSize: 13, marginTop: -16, marginBottom: 18, padding: "8px 12px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, textAlign: "left" }}>
            ⚠️ {error || validation.error}
          </div>
        )}
        <div style={{ color: "#666", fontSize: 11, marginTop: -16, marginBottom: 18, textAlign: "left" }}>
          💡 Min 2 huruf · tanpa angka · tanpa simbol
        </div>

        <div style={S.actions}>
          <button onClick={() => onContinue("")} style={S.skipBtn}>Skip →</button>
          <button onClick={() => handleContinue(name.trim())} style={S.continueBtn}>
            Lanjut ke Menu →
          </button>
        </div>
      </main>
    </div>
  );
}

const S = {
  root: { minHeight:"100vh", background:"#111", color:"#fff", fontFamily:"'Inter',sans-serif" },
  header: { display:"flex", justifyContent:"space-between", padding:"14px 24px", borderBottom:"1px solid #222", background:"#0a0a0a" },
  backBtn: { background:"transparent", border:"1px solid #333", color:"#aaa", padding:"8px 14px", borderRadius:8, fontSize:13, cursor:"pointer", fontFamily:"inherit" },
  cancelBtn: { background:"transparent", border:"1px solid #444", color:"#aaa", padding:"8px 12px", borderRadius:8, fontSize:14, cursor:"pointer", fontFamily:"inherit", minWidth:36 },
  main: { maxWidth:560, margin:"0 auto", padding:"40px 24px", textAlign:"center" },
  summary: { background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:12, padding:"12px 20px",
    color:"#F59E0B", fontSize:14, fontWeight:600, marginBottom:40, display:"inline-block" },
  title: { fontFamily:"'Inter',sans-serif", fontSize:48, letterSpacing:3, color:"#F59E0B", margin:"0 0 8px" },
  subtitle: { color:"#888", fontSize:14, marginBottom:32 },
  input: { width:"100%", padding:"16px 20px", borderRadius:12, background:"#1a1a1a", border:"2px solid #2a2a2a",
    color:"#fff", fontFamily:"inherit", fontSize:18, boxSizing:"border-box", marginBottom:24, textAlign:"center" },
  actions: { display:"flex", gap:12, justifyContent:"center" },
  skipBtn: { background:"transparent", border:"1px solid #333", color:"#aaa", padding:"14px 24px",
    borderRadius:12, fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:"inherit" },
  continueBtn: { background:"#F59E0B", color:"#111", border:"none", padding:"14px 28px",
    borderRadius:12, fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }
};
