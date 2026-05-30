// karyaOS — On-screen keyboard untuk POS touchscreen
// Auto-show saat input difocus. Numeric (tel/number) → numpad. Text/email/search → QWERTY.
// Useful untuk: cashier name, customer name, phone, cash received, voucher code, PIN, search, dll.
import { useState, useEffect } from "react";

// Global state — track which input is active
let activeInputCallback = null;
let activeInputValue = "";
let activeInputType = "number"; // 'number' | 'text'
let activeInputLabel = "";
let activeInputEl = null; // track underlying DOM input untuk auto-sync
const listeners = new Set();

function notifyListeners() {
  listeners.forEach(fn => fn({
    active: !!activeInputCallback,
    value: activeInputValue,
    label: activeInputLabel,
    type: activeInputType,
  }));
}

// Open keyboard programmatically (atau via TouchInput wrapper)
export function showNumpad({ value, onChange, label, type = "number", el = null }) {
  activeInputCallback = onChange;
  activeInputValue = value || "";
  activeInputLabel = label || "";
  activeInputType = type;
  activeInputEl = el;
  notifyListeners();
}
export function hideNumpad() {
  activeInputCallback = null;
  activeInputValue = "";
  activeInputEl = null;
  notifyListeners();
}

// Set input value + dispatch native input event (for React onChange to fire)
function syncToInput(el, value) {
  if (!el) return;
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set
    || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
  if (nativeSetter) nativeSetter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

// Decide keyboard type from input element
function detectType(el) {
  if (!el) return "text";
  const t = (el.type || "").toLowerCase();
  const im = (el.inputMode || "").toLowerCase();
  if (t === "number" || t === "tel" || im === "numeric" || im === "tel" || im === "decimal") return "number";
  return "text";
}

// Heuristic label from associated label / placeholder / name
function detectLabel(el) {
  if (!el) return "";
  if (el.getAttribute("data-kbd-label")) return el.getAttribute("data-kbd-label");
  if (el.placeholder) return el.placeholder;
  if (el.id) {
    const lab = document.querySelector(`label[for="${el.id}"]`);
    if (lab) return lab.textContent?.trim() || "";
  }
  if (el.name) return el.name;
  return "";
}

// TouchInput — drop-in wrapper untuk input yg explicit-trigger numpad pada focus.
// Props sama dengan <input> plus optional `numpadType` ('number' | 'text').
export function TouchInput({ value, onChange, label, numpadType = "number", style, ...rest }) {
  return (
    <input
      value={value || ""}
      onChange={(e) => { onChange?.(e); if (activeInputCallback) activeInputValue = e.target.value; }}
      onFocus={(e) => showNumpad({
        value,
        onChange: (newVal) => onChange?.({ target: { value: newVal } }),
        label,
        type: numpadType,
        el: e.currentTarget,
      })}
      inputMode={numpadType === "text" ? "text" : "tel"}
      style={style}
      {...rest}
    />
  );
}

// Mount once di app root — listens for global activeInput state
// Auto-attach: pasang global focus listener untuk SEMUA input/textarea, kecuali yg opt-out via data-no-kbd
export default function TouchNumpad({ autoAttach = true }) {
  const [state, setState] = useState({ active: false, value: "", label: "", type: "number" });
  const [shift, setShift] = useState(false);
  const [symbols, setSymbols] = useState(false);

  useEffect(() => {
    const fn = (s) => setState(s);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);

  // Auto-attach global focus listener — bekerja untuk input yg gak pakai TouchInput wrapper
  // PENTING: cuma trigger di TOUCHSCREEN device. Desktop dgn mouse + keyboard
  // fisik gak perlu on-screen numpad — auto-show malah distract (lihat Pos3
  // screenshot: numpad muncul tanpa di-trigger sama Bintoro di MacBook).
  useEffect(() => {
    if (!autoAttach) return;
    // Touch detection: pointer:coarse = touchscreen primary
    const isTouch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
    if (!isTouch) return; // skip on desktop/laptop
    const onFocus = (e) => {
      const el = e.target;
      if (!el || (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA")) return;
      // Skip kalau opt-out via data-no-kbd, atau type=checkbox/radio/file/range/etc
      if (el.hasAttribute("data-no-kbd")) return;
      const skipTypes = ["checkbox", "radio", "file", "range", "color", "date", "datetime-local", "time", "month", "week"];
      if (skipTypes.includes((el.type || "").toLowerCase())) return;
      // Sudah attached untuk input ini (TouchInput wrapper handle sendiri) → skip
      if (activeInputEl === el) return;
      const type = detectType(el);
      showNumpad({
        value: el.value || "",
        label: detectLabel(el),
        type,
        el,
        onChange: (newVal) => syncToInput(el, newVal),
      });
    };
    const onBlur = (e) => {
      // Don't auto-close on blur — user mungkin tap key di keyboard yg trigger blur
      // Close hanya saat focus pindah ke non-input element bukan numpad itself
      setTimeout(() => {
        const ae = document.activeElement;
        if (!ae || (ae.tagName !== "INPUT" && ae.tagName !== "TEXTAREA")) {
          // Cek apakah focus pindah ke numpad button — jangan close
          if (ae && ae.closest && ae.closest("[data-touchkbd-panel]")) return;
          // Else: keep open — user kontrol via tombol X / OK
        }
      }, 100);
    };
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onBlur);
    return () => {
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onBlur);
    };
  }, [autoAttach]);

  if (!state.active) return null;

  const append = (ch) => {
    const newVal = (state.value || "") + ch;
    activeInputValue = newVal;
    activeInputCallback?.(newVal);
    setState(s => ({ ...s, value: newVal }));
    if (shift) setShift(false); // auto-disable shift after typing
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
  const close = () => {
    // Blur the input too so caret hilang
    if (activeInputEl && activeInputEl.blur) activeInputEl.blur();
    hideNumpad();
  };

  const isText = state.type === "text";

  return (
    <div data-touchkbd-panel style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 99998,
      background: "linear-gradient(180deg, rgba(8,9,15,0.97), #050810)",
      borderTop: "2px solid rgba(245,158,11,0.4)",
      boxShadow: "0 -16px 48px rgba(0,0,0,0.6), 0 -1px 0 rgba(245,158,11,0.2)",
      padding: "12px 14px 14px", fontFamily: "'Inter',sans-serif",
      animation: "numpadSlide 0.18s ease-out",
    }} onMouseDown={(e) => e.preventDefault() /* prevent input from blur-ing */}>
      <style>{`
        @keyframes numpadSlide { from { transform: translateY(100%); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        .tkb-row { display: grid; gap: 6px; }
      `}</style>
      <div style={{ maxWidth: isText ? 980 : 720, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 10, color: "#fbbf24", letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>{state.label || (isText ? "TEXT INPUT" : "NUMERIC INPUT")}</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", fontFamily: isText ? "inherit" : "'Geist Mono',monospace", letterSpacing: isText ? -0.2 : 0.5, marginTop: 2, minHeight: 28, wordBreak: "break-all" }}>
              {state.value || <span style={{ color: "#5b6470" }}>—</span>}
            </div>
          </div>
          <button onClick={close} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#e6edf3", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>✕ Tutup</button>
        </div>

        {isText ? (
          <QwertyKeyboard
            shift={shift} setShift={setShift}
            symbols={symbols} setSymbols={setSymbols}
            onKey={append} onBackspace={backspace} onClear={clear} onDone={close}
          />
        ) : (
          <NumericPad onKey={append} onBackspace={backspace} onClear={clear} onDone={close} />
        )}
      </div>
    </div>
  );
}

function NumericPad({ onKey, onBackspace, onClear, onDone }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr) 80px", gap: 8 }}>
      {[1, 2, 3].map(n => <PadBtn key={n} onClick={() => onKey(String(n))}>{n}</PadBtn>)}
      <PadBtn variant="warn" onClick={onBackspace}>⌫</PadBtn>
      {[4, 5, 6].map(n => <PadBtn key={n} onClick={() => onKey(String(n))}>{n}</PadBtn>)}
      <PadBtn variant="danger" onClick={onClear}>C</PadBtn>
      {[7, 8, 9].map(n => <PadBtn key={n} onClick={() => onKey(String(n))}>{n}</PadBtn>)}
      <PadBtn variant="primary" onClick={onDone}>✓</PadBtn>
      <PadBtn onClick={() => onKey("00")}>00</PadBtn>
      <PadBtn onClick={() => onKey("0")}>0</PadBtn>
      <PadBtn onClick={() => onKey(".")}>.</PadBtn>
      <PadBtn variant="primary" onClick={onDone}>✓ OK</PadBtn>
    </div>
  );
}

const KB_ROW_1 = ["q","w","e","r","t","y","u","i","o","p"];
const KB_ROW_2 = ["a","s","d","f","g","h","j","k","l"];
const KB_ROW_3 = ["z","x","c","v","b","n","m"];
const SYM_ROW_1 = ["1","2","3","4","5","6","7","8","9","0"];
const SYM_ROW_2 = ["-","/",":",";","(",")","$","&","@","\""];
const SYM_ROW_3 = [".",",","?","!","'","#","%","+","*"];

function QwertyKeyboard({ shift, setShift, symbols, setSymbols, onKey, onBackspace, onClear, onDone }) {
  const r1 = symbols ? SYM_ROW_1 : KB_ROW_1;
  const r2 = symbols ? SYM_ROW_2 : KB_ROW_2;
  const r3 = symbols ? SYM_ROW_3 : KB_ROW_3;
  const transform = (ch) => shift && !symbols ? ch.toUpperCase() : ch;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div className="tkb-row" style={{ gridTemplateColumns: `repeat(${r1.length}, 1fr)` }}>
        {r1.map(ch => <PadBtn small key={ch} onClick={() => onKey(transform(ch))}>{transform(ch)}</PadBtn>)}
      </div>
      <div className="tkb-row" style={{ gridTemplateColumns: `repeat(${r2.length}, 1fr)` }}>
        {r2.map(ch => <PadBtn small key={ch} onClick={() => onKey(transform(ch))}>{transform(ch)}</PadBtn>)}
      </div>
      <div className="tkb-row" style={{ gridTemplateColumns: `64px repeat(${r3.length}, 1fr) 72px` }}>
        <PadBtn small variant={shift ? "primary" : undefined} onClick={() => setShift(s => !s)} style={{ fontSize: 14 }}>{symbols ? "·" : (shift ? "⇧" : "⇧")}</PadBtn>
        {r3.map(ch => <PadBtn small key={ch} onClick={() => onKey(transform(ch))}>{transform(ch)}</PadBtn>)}
        <PadBtn small variant="warn" onClick={onBackspace}>⌫</PadBtn>
      </div>
      <div className="tkb-row" style={{ gridTemplateColumns: "90px 80px 1fr 80px 100px" }}>
        <PadBtn small onClick={() => setSymbols(s => !s)} style={{ fontSize: 13, fontWeight: 800 }}>{symbols ? "ABC" : "?123"}</PadBtn>
        <PadBtn small onClick={() => onKey(",")}>,</PadBtn>
        <PadBtn small onClick={() => onKey(" ")} style={{ fontSize: 12, letterSpacing: 2 }}>SPACE</PadBtn>
        <PadBtn small onClick={() => onKey(".")}>.</PadBtn>
        <PadBtn small variant="primary" onClick={onDone} style={{ fontSize: 13 }}>✓ OK</PadBtn>
      </div>
      <div className="tkb-row" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <PadBtn small variant="danger" onClick={onClear} style={{ fontSize: 12 }}>HAPUS SEMUA</PadBtn>
        <PadBtn small onClick={onBackspace} style={{ fontSize: 12 }}>⌫ HAPUS</PadBtn>
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
    <button onClick={onClick} onMouseDown={(e) => e.preventDefault() /* prevent input blur */} style={{
      padding: small ? "12px 0" : "14px 0",
      borderRadius: 10,
      background: bg,
      border: variant ? "none" : "1px solid rgba(255,255,255,0.08)",
      color,
      fontSize: small ? 18 : 22, fontWeight: 800, fontFamily: "'Geist Mono',monospace",
      cursor: "pointer",
      touchAction: "manipulation",
      transition: "transform 0.08s ease, filter 0.08s ease",
      boxShadow: variant ? "0 2px 8px rgba(0,0,0,0.3)" : "none",
      userSelect: "none",
      ...(style || {}),
    }}
    onPointerDown={(e) => { e.currentTarget.style.transform = "scale(0.96)"; e.currentTarget.style.filter = "brightness(1.15)"; }}
    onPointerUp={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.filter = "none"; }}
    onPointerLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.filter = "none"; }}
    >{children}</button>
  );
}
