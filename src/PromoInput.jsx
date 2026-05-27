import { useState, useRef } from "react";
import { api } from "./api.js";

import { fmtMoney as fIDR } from "./lib/currency.js";

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
        <button onPointerDown={e=>{e.preventDefault();onChange("");}} style={KB.clearKey}>Clear</button>
        <button onPointerDown={e=>{e.preventDefault();onChange(value+"-");}} style={{...KB.key,width:56}} disabled={value.endsWith("-")}>-</button>
        <button onPointerDown={e=>{e.preventDefault();onSubmit();}} className="lg lg-brand" style={KB.enterKey}>Check →</button>
      </div>
    </div>
  );
}

const KB = {
  wrap:     { width:"100%", maxWidth:500, margin:"0 auto" },
  row:      { display:"flex", justifyContent:"center", gap:6, marginBottom:6 },
  key:      { minWidth:40, height:50, background:"rgba(255,255,255,0.035)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:12, color:"rgba(255,255,255,0.92)", fontSize:15, fontWeight:600, fontFamily:"'Inter',sans-serif", transition:"all 0.12s ease", cursor:"pointer", letterSpacing:"-0.1px" },
  delKey:   { minWidth:52, height:50, background:"rgba(248,113,113,0.08)", border:"1px solid rgba(248,113,113,0.18)", borderRadius:12, color:"rgba(248,113,113,0.85)", fontSize:17, fontWeight:600, cursor:"pointer", fontFamily:"'Inter',sans-serif" },
  clearKey: { height:50, flex:1, background:"rgba(255,255,255,0.025)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:12, color:"rgba(255,255,255,0.55)", fontSize:13, fontWeight:500, cursor:"pointer", fontFamily:"'Inter',sans-serif", letterSpacing:"-0.1px" },
  enterKey: { height:50, flex:2, border:"none", borderRadius:12, color:"#fff", fontSize:14, fontWeight:600, letterSpacing:"-0.2px", fontFamily:"'Inter',sans-serif", cursor:"pointer" },
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
      <div className="lg" style={P.modal} onClick={e=>e.stopPropagation()}>
        <style>{`
          @keyframes piSlideUp{from{transform:translateY(40px) scale(.97);opacity:0}to{transform:translateY(0) scale(1);opacity:1}}
          @keyframes piShake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}
          @keyframes piPop{0%{transform:scale(0.8);opacity:0}70%{transform:scale(1.04)}100%{transform:scale(1);opacity:1}}
          @keyframes piSpin{to{transform:rotate(360deg)}}
        `}</style>

        {/* Handle */}
        <div style={P.handle}/>

        {/* Header */}
        <div style={P.header}>
          <div style={P.headerLeft}>
            <span style={P.headerIcon}>🏷️</span>
            <div>
              <div style={P.title}>Promo code</div>
              <div style={P.sub}>Enter a code to get a discount</div>
            </div>
          </div>
          <button style={P.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div style={P.body}>
          {/* Code display */}
          <div style={{
            ...P.codeDisplay,
            borderColor: status==="ok"?"rgba(52,211,153,0.5)":status==="error"?"rgba(248,113,113,0.5)":"rgba(255,255,255,0.08)",
            animation: status==="error"?"piShake 0.4s ease":"none",
          }}>
            <span style={P.codeText}>{code || <span style={P.codePlaceholder}>XXXXX</span>}</span>
            {status==="checking" && <div style={P.spinner}/>}
            {status==="ok"       && <span style={{color:"#34D399",fontSize:22}}>✓</span>}
            {status==="error"    && <span style={{color:"#F87171",fontSize:20}}>✗</span>}
          </div>

          {/* Validation result */}
          {status==="ok" && result && (
            <div style={{...P.resultBox, animation:"piPop 0.35s cubic-bezier(.2,.8,.2,1)"}}>
              <div style={P.resultIcon}>🎉</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={P.resultTitle}>{result.desc}</div>
                <div style={P.resultDiscount}>You save {fIDR(result.discount)}</div>
                {result.freeItems?.length > 0 && (
                  <div style={P.resultFree}>
                    🎁 Free: {result.freeItems.map(fi => `${fi.qty}× ${fi.name}`).join(", ")}
                  </div>
                )}
                {result.paymentHint && (
                  <div style={P.resultPayHint}>
                    🏦 Pay with {result.paymentHint}
                  </div>
                )}
              </div>
              <div style={P.resultAmount}>−{fIDR(result.discount)}</div>
            </div>
          )}

          {status==="error" && (
            <div style={P.errorBox}>
              <span style={{fontSize:16}}>⚠️</span>
              <span style={P.errorMsg}>{errMsg}</span>
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
            <div style={{display:"flex",gap:10,width:"100%",marginTop:6}}>
              <button style={P.cancelBtn} onClick={()=>{setCode("");setStatus("idle");setResult(null);}}>
                Change code
              </button>
              <button style={P.applyBtn} onClick={handleApply}>
                <span>Apply discount</span>
                <span style={P.applyBtnAmount}>−{fIDR(result.discount)}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const FONT = "'Inter',sans-serif";
const P = {
  overlay:    { position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", backdropFilter:"blur(20px) saturate(180%)", WebkitBackdropFilter:"blur(20px) saturate(180%)", zIndex:300, display:"flex", alignItems:"flex-end", justifyContent:"center", fontFamily:FONT },
  modal:      { borderRadius:"32px 32px 0 0", width:"100%", maxWidth:560, animation:"piSlideUp 0.35s cubic-bezier(.2,.8,.2,1)", borderBottom:"none", maxHeight:"90vh", display:"flex", flexDirection:"column", overflow:"hidden" },
  handle:     { width:40, height:4, borderRadius:2, background:"rgba(255,255,255,0.15)", margin:"10px auto 4px", flexShrink:0 },
  header:     { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 22px 16px", borderBottom:"1px solid rgba(255,255,255,0.06)" },
  headerLeft: { display:"flex", alignItems:"center", gap:12, minWidth:0, flex:1 },
  headerIcon: { fontSize:26, filter:"drop-shadow(0 4px 12px rgba(0,0,0,0.3))" },
  title:      { fontFamily:FONT, fontSize:18, fontWeight:600, letterSpacing:"-0.4px", color:"rgba(255,255,255,0.95)", lineHeight:1.1 },
  sub:        { fontSize:12, color:"rgba(255,255,255,0.45)", marginTop:3, fontFamily:FONT },
  closeBtn:   { background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:"50%", width:32, height:32, color:"rgba(255,255,255,0.6)", fontSize:13, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", flexShrink:0 },
  body:       { padding:"18px 20px 22px", display:"flex", flexDirection:"column", alignItems:"stretch", gap:12, overflowY:"auto" },
  codeDisplay:{ display:"flex", alignItems:"center", justifyContent:"center", gap:12, width:"100%", background:"rgba(255,255,255,0.025)", border:"1.5px solid", borderRadius:18, padding:"16px 20px", transition:"border-color 0.3s", minHeight:62 },
  codeText:   { fontFamily:FONT, fontSize:26, fontWeight:600, letterSpacing:5, color:"#fff", flex:1, textAlign:"center", fontVariantNumeric:"tabular-nums" },
  codePlaceholder:{ color:"rgba(255,255,255,0.2)", letterSpacing:4 },
  spinner:    { width:20, height:20, border:"2px solid rgba(255,255,255,0.1)", borderTop:"2px solid var(--brand-primary,#FF6B35)", borderRadius:"50%", animation:"piSpin 0.8s linear infinite", flexShrink:0 },
  resultBox:  { display:"flex", alignItems:"center", gap:12, width:"100%", background:"rgba(52,211,153,0.08)", border:"1px solid rgba(52,211,153,0.22)", borderRadius:16, padding:"14px 16px" },
  resultIcon: { fontSize:24, flexShrink:0, filter:"drop-shadow(0 4px 10px rgba(52,211,153,0.3))" },
  resultTitle:{ fontSize:14, fontWeight:600, color:"#34D399", marginBottom:3, letterSpacing:"-0.2px", fontFamily:FONT },
  resultDiscount:{ fontSize:11, color:"rgba(255,255,255,0.55)", fontFamily:FONT },
  resultFree: { fontSize:11, color:"#34D399", marginTop:5, fontWeight:500, fontFamily:FONT },
  resultPayHint:{ fontSize:11, color:"#F59E0B", marginTop:5, fontWeight:500, fontFamily:FONT },
  resultAmount:{ fontFamily:FONT, fontSize:20, fontWeight:600, color:"#34D399", letterSpacing:"-0.4px", marginLeft:"auto", flexShrink:0, fontVariantNumeric:"tabular-nums" },
  errorBox:   { display:"flex", alignItems:"center", gap:10, width:"100%", background:"rgba(248,113,113,0.08)", border:"1px solid rgba(248,113,113,0.22)", borderRadius:14, padding:"11px 16px" },
  errorMsg:   { fontSize:13, color:"rgba(248,113,113,0.9)", fontFamily:FONT, letterSpacing:"-0.1px" },
  applyBtn:   { flex:2, background:"linear-gradient(180deg,#34D399,#10b981)", border:"1px solid rgba(255,255,255,0.16)", borderRadius:14, padding:"14px 18px", color:"#fff", fontSize:14, fontWeight:600, letterSpacing:"-0.2px", fontFamily:FONT, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, boxShadow:"inset 0 1px 0 rgba(255,255,255,0.22), 0 8px 24px rgba(52,211,153,0.25)" },
  applyBtnAmount:{ fontSize:15, fontWeight:600, letterSpacing:"-0.3px", fontVariantNumeric:"tabular-nums" },
  cancelBtn:  { background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:14, padding:"13px 18px", color:"rgba(255,255,255,0.7)", fontSize:13, fontWeight:500, cursor:"pointer", fontFamily:FONT, letterSpacing:"-0.1px" },
};
