import { useState, useRef } from "react";
import { api } from "./api.js";

const fIDR = (a) => "Rp " + Math.round(a||0).toLocaleString("id-ID");

// ── QWERTY KEYBOARD ───────────────────────────────────────────────────────────
const ROWS = [
  ["1","2","3","4","5","6","7","8","9","0"],
  ["Q","W","E","R","T","Y","U","I","O","P"],
  ["A","S","D","F","G","H","J","K","L"],
  ["Z","X","C","V","B","N","M","⌫"],
];

function TouchKeyboard({ value, onChange, onSubmit }) {
  const handleKey = (k) => {
    if (k === "⌫") { onChange(value.slice(0,-1)); return; }
    if (value.length < 20) onChange(value + k);
  };
  return (
    <div style={KB.wrap}>
      {ROWS.map((row, ri) => (
        <div key={ri} style={KB.row}>
          {row.map(k => (
            <button key={k} onPointerDown={e=>{e.preventDefault(); handleKey(k);}}
              style={k==="⌫" ? KB.delKey : KB.key}>
              {k}
            </button>
          ))}
        </div>
      ))}
      <div style={KB.row}>
        <button onPointerDown={e=>{e.preventDefault();onChange("");}} style={KB.clearKey}>HAPUS</button>
        <button onPointerDown={e=>{e.preventDefault();onChange(value+"-");}} style={{...KB.key,width:56}} disabled={value.endsWith("-")}>-</button>
        <button onPointerDown={e=>{e.preventDefault();onSubmit();}} style={KB.enterKey}>GUNAKAN →</button>
      </div>
    </div>
  );
}

const KB = {
  wrap:     { width:"100%", maxWidth:500 },
  row:      { display:"flex", justifyContent:"center", gap:6, marginBottom:6 },
  key:      { minWidth:40, height:52, background:"#1a1a2e", border:"1px solid #252545", borderRadius:10, color:"#fff", fontSize:15, fontWeight:700, fontFamily:"'Inter',sans-serif", transition:"background 0.08s" },
  delKey:   { minWidth:52, height:52, background:"#2a1a2e", border:"1px solid #3a2545", borderRadius:10, color:"#F87171", fontSize:18, fontWeight:700 },
  clearKey: { height:52, flex:1, background:"#1a1a1a", border:"1px solid #252525", borderRadius:10, color:"#888", fontSize:13, fontWeight:600 },
  enterKey: { height:52, flex:2, background:"linear-gradient(90deg,#F59E0B,#F97316)", border:"none", borderRadius:10, color:"#050810", fontSize:14, fontWeight:700, letterSpacing:1, fontFamily:"'Inter',sans-serif" },
};

// ── PROMO INPUT MODAL ─────────────────────────────────────────────────────────
export default function PromoInput({ subtotal, customerId, customerTags, cart, onApply, onClose }) {
  const [code,    setCode]    = useState("");
  const [status,  setStatus]  = useState("idle"); // idle | checking | ok | error
  const [result,  setResult]  = useState(null);
  const [errMsg,  setErr]     = useState("");

  async function handleSubmit() {
    if (!code.trim()) return;
    setStatus("checking"); setErr("");
    try {
      const res = await api.validatePromo({ code: code.trim(), subtotal, customerId, customerTags, cart });
      if (res.ok) {
        setResult(res);
        setStatus("ok");
      } else {
        setErr(res.error || "Kode tidak valid");
        setStatus("error");
      }
    } catch {
      setErr("Gagal terhubung ke server");
      setStatus("error");
    }
  }

  function handleApply() {
    if (result) onApply(result);
  }

  return (
    <div style={P.overlay} onClick={onClose}>
      <div style={P.modal} onClick={e=>e.stopPropagation()}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@700;800;900&family=DM+Sans:wght@400;600;700&display=swap');
          *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
          @keyframes slideUp{from{transform:translateY(40px);opacity:0}to{transform:translateY(0);opacity:1}}
          @keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}
          @keyframes popIn{0%{transform:scale(0.8);opacity:0}70%{transform:scale(1.05)}100%{transform:scale(1);opacity:1}}
          @keyframes spin{to{transform:rotate(360deg)}}
          button{cursor:pointer;font-family:'Inter',sans-serif;}
        `}</style>

        {/* Header */}
        <div style={P.header}>
          <div style={P.headerLeft}>
            <span style={{fontSize:28}}>🏷️</span>
            <div>
              <div style={P.title}>KODE PROMO</div>
              <div style={P.sub}>Masukkan kode untuk mendapatkan diskon</div>
            </div>
          </div>
          <button style={P.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={P.body}>
          {/* Code display */}
          <div style={{
            ...P.codeDisplay,
            borderColor: status==="ok"?"#34D399":status==="error"?"#F87171":"#21262d",
            animation: status==="error"?"shake 0.4s ease":"none",
          }}>
            <span style={P.codeText}>{code || <span style={{color:"#444",letterSpacing:4}}>XXXXX</span>}</span>
            {status==="checking" && <div style={P.spinner}/>}
            {status==="ok"       && <span style={{color:"#34D399",fontSize:22}}>✓</span>}
            {status==="error"    && <span style={{color:"#F87171",fontSize:20}}>✗</span>}
          </div>

          {/* Validation result */}
          {status==="ok" && result && (
            <div style={{...P.resultBox, animation:"popIn 0.35s ease"}}>
              <div style={P.resultIcon}>🎉</div>
              <div>
                <div style={P.resultTitle}>{result.desc}</div>
                <div style={P.resultDiscount}>Hemat {fIDR(result.discount)}</div>
                    {result.freeItems?.length > 0 && (
                      <div style={{fontSize:11,color:"#34D399",marginTop:6,fontWeight:600}}>
                        🎁 GRATIS: {result.freeItems.map(fi => `${fi.qty}× ${fi.name}`).join(", ")}
                      </div>
                    )}
                    {result.paymentHint && (
                      <div style={{fontSize:11,color:"#F59E0B",marginTop:6,fontWeight:600}}>
                        🏦 Bayar pakai aplikasi {result.paymentHint} ya
                      </div>
                    )}
              </div>
              <div style={P.resultAmount}>-{fIDR(result.discount)}</div>
            </div>
          )}

          {status==="error" && (
            <div style={P.errorBox}>
              <span style={{fontSize:18}}>⚠️</span>
              <span style={{fontSize:13,color:"#F87171"}}>{errMsg}</span>
            </div>
          )}

          {/* Keyboard */}
          {status !== "ok" && (
            <TouchKeyboard
              value={code}
              onChange={v => { setCode(v.toUpperCase()); setStatus("idle"); setErr(""); }}
              onSubmit={handleSubmit}
            />
          )}

          {/* Apply button after success */}
          {status==="ok" && result && (
            <div style={{display:"flex",gap:10,width:"100%",marginTop:8}}>
              <button style={P.cancelBtn} onClick={()=>{setCode("");setStatus("idle");setResult(null);}}>
                Ganti Kode
              </button>
              <button style={P.applyBtn} onClick={handleApply}>
                PAKAI DISKON {fIDR(result.discount)} →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const P = {
  overlay:    { position:"fixed", inset:0, background:"rgba(0,0,0,0.88)", zIndex:300, display:"flex", alignItems:"flex-end", justifyContent:"center" },
  modal:      { background:"#0d1117", borderRadius:"24px 24px 0 0", width:"100%", maxWidth:560, animation:"slideUp 0.3s ease", border:"1px solid #1a1a2e", borderBottom:"none", maxHeight:"90vh", display:"flex", flexDirection:"column" },
  header:     { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"20px 22px 16px", borderBottom:"1px solid #1a1a2e" },
  headerLeft: { display:"flex", alignItems:"center", gap:12 },
  title:      { fontFamily:"'Inter',sans-serif", fontSize:22, letterSpacing:3, color:"#F59E0B" },
  sub:        { fontSize:11, color:"#555" },
  closeBtn:   { background:"#1a1a2e", border:"none", borderRadius:"50%", width:34, height:34, color:"#888", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" },
  body:       { padding:"16px 20px 24px", display:"flex", flexDirection:"column", alignItems:"center", gap:14, overflowY:"auto" },
  codeDisplay:{ display:"flex", alignItems:"center", justifyContent:"center", gap:12, width:"100%", background:"#080c10", border:"2px solid", borderRadius:16, padding:"16px 20px", transition:"border-color 0.3s", minHeight:62 },
  codeText:   { fontFamily:"'Inter',sans-serif", fontSize:28, letterSpacing:6, color:"#fff", flex:1, textAlign:"center" },
  spinner:    { width:20, height:20, border:"2px solid #333", borderTop:"2px solid #F59E0B", borderRadius:"50%", animation:"spin 0.8s linear infinite", flexShrink:0 },
  resultBox:  { display:"flex", alignItems:"center", gap:12, width:"100%", background:"rgba(52,211,153,0.08)", border:"1px solid rgba(52,211,153,0.25)", borderRadius:14, padding:"14px 16px" },
  resultIcon: { fontSize:28, flexShrink:0 },
  resultTitle:{ fontSize:14, fontWeight:600, color:"#34D399", marginBottom:3 },
  resultDiscount:{ fontSize:12, color:"#888" },
  resultAmount:{ fontFamily:"'Inter',sans-serif", fontSize:22, color:"#34D399", letterSpacing:1, marginLeft:"auto", flexShrink:0 },
  errorBox:   { display:"flex", alignItems:"center", gap:10, width:"100%", background:"rgba(248,113,113,0.08)", border:"1px solid rgba(248,113,113,0.25)", borderRadius:12, padding:"12px 16px" },
  applyBtn:   { flex:2, background:"linear-gradient(90deg,#34D399,#059669)", border:"none", borderRadius:12, padding:"16px", color:"#fff", fontSize:15, fontWeight:700, letterSpacing:1, fontFamily:"'Inter',sans-serif" },
  cancelBtn:  { background:"#1a1a2e", border:"1px solid #21262d", borderRadius:12, padding:"14px 20px", color:"#888", fontSize:13, fontWeight:600 },
};
