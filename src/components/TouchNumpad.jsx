// karyaOS — On-screen numpad untuk POS touchscreen
// Auto-show saat input bertype 'tel'|'number' di-focus.
// Useful untuk: phone customer, cash received, voucher code, PIN, dll.
import { useState, useEffect, useRef } from "react";

// Global state — track which input is active
let activeInputCallback = null;
let activeInputValue = "";
let activeInputType = "number"; // 'number' | 'text' (alphanumeric)
let activeInputLabel = "";
const listeners = new Set();

function notifyListeners() {
  listeners.forEach(fn => fn({ active: !!activeInputCallback, value: activeInputValue, label: activeInputLabel, type: activeInputType }));
}

// Open numpad attached to an input — call from input onFocus
export function showNumpad({ value, onChange, label, type = "number" }) {
  activeInputCallback = onChange;
  activeInputValue = value || "";
  activeInputLabel = label || "";
  activeInputType = type;
  notifyListeners();
}
export function hideNumpad() {
  activeInputCallback = null;
  activeInputValue = "";
  notifyListeners();
}

// TouchInput — drop-in wrapper untuk input yg auto-trigger numpad pada focus.
// Props sama dengan <input> plus optional `numpadType` ('number' | 'text').
export function TouchInput({ value, onChange, label, numpadType = "number", style, ...rest }) {
  return (
    <input
      value={value || ""}
      onChange={(e) => { onChange?.(e); if (activeInputCallback) activeInputValue = e.target.value; }}
      onFocus={() => showNumpad({
        value,
        onChange: (newVal) => onChange?.({ target: { value: newVal } }),
        label,
        type: numpadType,
      })}
      // Don't auto-hide on blur — kasir mungkin pindah ke key lain
      inputMode={numpadType === "text" ? "text" : "tel"}
      style={style}
      {...rest}
    />
  );
}

// Mount once di app root — listens for global activeInput state
export default function TouchNumpad() {
  const [state, setState] = useState({ active: false, value: "", label: "", type: "number" });

  useEffect(() => {
    const fn = (s) => setState(s);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);

  if (!state.active) return null;

  const append = (ch) => {
    const newVal = (state.value || "") + ch;
    activeInputValue = newVal;
    activeInputCallback?.(newVal);
    setState(s => ({ ...s, value: newVal }));
  };
  const backspace = () => {
    const newVal = (state.value || "").slice(0, -1);
    activeInputValue = newVal;
    activeInputCallback?.(newVal);
    setState(s => ({ ...s, value: newVal }));
  };
  const clear = () => {
    activeInputValue = "";
    activeInputCallback?.("");
    setState(s => ({ ...s, value: "" }));
  };

  // Numeric only — sesuai request user 'cukup nomor aja'
  const isText = false;

  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 99998,
      background: "linear-gradient(180deg, rgba(8,9,15,0.96), #050810)",
      borderTop: "2px solid rgba(245,158,11,0.4)",
      boxShadow: "0 -16px 48px rgba(0,0,0,0.6), 0 -1px 0 rgba(245,158,11,0.2)",
      padding: 14, fontFamily: "'Inter',sans-serif",
      animation: "numpadSlide 0.2s ease-out",
    }}>
      <style>{`@keyframes numpadSlide { from { transform: translateY(100%); opacity: 0 } to { transform: translateY(0); opacity: 1 } }`}</style>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 10, color: "#fbbf24", letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>{state.label || "INPUT"}</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: "#fff", fontFamily: "'Geist Mono',monospace", letterSpacing: 0.5, marginTop: 2, minHeight: 30 }}>
              {state.value || <span style={{ color: "#5b6470" }}>—</span>}
            </div>
          </div>
          <button onClick={hideNumpad} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#e6edf3", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>✕ Tutup</button>
        </div>

        {/* Number Pad */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr) 80px", gap: 8 }}>
          {[1, 2, 3].map(n => <PadBtn key={n} onClick={() => append(String(n))}>{n}</PadBtn>)}
          <PadBtn variant="warn" onClick={backspace}>⌫</PadBtn>
          {[4, 5, 6].map(n => <PadBtn key={n} onClick={() => append(String(n))}>{n}</PadBtn>)}
          <PadBtn variant="danger" onClick={clear}>C</PadBtn>
          {[7, 8, 9].map(n => <PadBtn key={n} onClick={() => append(String(n))}>{n}</PadBtn>)}
          <PadBtn variant="primary" onClick={hideNumpad}>✓</PadBtn>
          <PadBtn onClick={() => append("00")}>00</PadBtn>
          <PadBtn onClick={() => append("0")}>0</PadBtn>
          <PadBtn onClick={() => append("000")}>000</PadBtn>
          <PadBtn variant="primary" onClick={hideNumpad}>✓ OK</PadBtn>
        </div>
      </div>
    </div>
  );
}

function PadBtn({ children, onClick, variant, small, style }) {
  const bg = variant === "primary" ? "linear-gradient(135deg,#10b981,#34d399)"
           : variant === "warn"    ? "linear-gradient(135deg,#f59e0b,#fbbf24)"
           : variant === "danger"  ? "linear-gradient(135deg,#ef4444,#dc2626)"
           : "rgba(255,255,255,0.05)";
  const color = variant === "primary" ? "#04130c"
              : variant === "warn"    ? "#1a1205"
              : variant === "danger"  ? "#fff"
              : "#e6edf3";
  return (
    <button onClick={onClick} style={{
      padding: small ? "10px 12px" : "14px 0",
      borderRadius: 10,
      background: bg,
      border: variant ? "none" : "1px solid rgba(255,255,255,0.08)",
      color,
      fontSize: small ? 16 : 22, fontWeight: 800, fontFamily: "'Geist Mono',monospace",
      cursor: "pointer",
      touchAction: "manipulation",
      transition: "transform 0.08s ease, filter 0.08s ease",
      boxShadow: variant ? "0 2px 8px rgba(0,0,0,0.3)" : "none",
      ...(style || {}),
    }}
    onMouseDown={(e) => { e.currentTarget.style.transform = "scale(0.96)"; e.currentTarget.style.filter = "brightness(1.1)"; }}
    onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.filter = "none"; }}
    onTouchStart={(e) => { e.currentTarget.style.transform = "scale(0.96)"; }}
    onTouchEnd={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
    >{children}</button>
  );
}
