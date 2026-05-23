// karyaOS — Shared UI Library
// Standard components untuk konsistensi UX di seluruh admin module.
//
// Provider: <UiKitProvider> wrapped di main.jsx
// Hook: const { confirm, toast, undoToast, prompt } = useUiKit();
//
// Components: <EmptyState> · <TooltipButton> · <LoadingSkeleton>
//             · <BulkActionBar> · <StatHeader> · <SearchBar>
//
// Hook: useKeyboardShortcut(key, handler, deps)

import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";

const C = { card: "#0d1117", border: "#1b212c", sub: "#9ca3af", dim: "#5b6470", text: "#e6edf3" };
const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");

// ════════════════════════════════════════════════════════════════════
// PROVIDER + HOOKS
// ════════════════════════════════════════════════════════════════════
const UiKitContext = createContext(null);

// ════════════════════════════════════════════════════════════════════
// GLOBAL CSS — Responsive + a11y + touch-friendly + focus-visible
// ════════════════════════════════════════════════════════════════════
const GLOBAL_CSS = `
  /* Focus visible for keyboard navigation */
  *:focus-visible { outline: 2px solid #3b82f6 !important; outline-offset: 2px !important; border-radius: 4px; }

  /* Touch-friendly buttons & inputs on mobile */
  @media (max-width: 768px) {
    .uikit-grid-2, .uikit-grid-3, .uikit-grid-4 { grid-template-columns: 1fr !important; }
    .uikit-touch button, .uikit-touch input[type="checkbox"] { min-height: 36px; }
    .uikit-modal-card { width: 95vw !important; max-width: 95vw !important; padding: 16px !important; }
    .uikit-form-row { flex-direction: column !important; gap: 8px !important; }
    .uikit-hide-mobile { display: none !important; }
  }
  @media (max-width: 480px) {
    .uikit-grid-auto-fill { grid-template-columns: 1fr !important; }
    .uikit-toolbar { flex-direction: column !important; align-items: stretch !important; }
  }

  /* Skeleton pulse */
  @keyframes uiKitSkeleton { 0%,100% { opacity: 0.4; } 50% { opacity: 0.8; } }
  @keyframes uiKitToastIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes uiKitFadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes uiKitShake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-3px); } 75% { transform: translateX(3px); } }

  /* Form validation states */
  .uikit-input-error { border-color: #ef4444 !important; animation: uiKitShake 0.3s ease-out; }
  .uikit-input-success { border-color: #10b981 !important; }

  /* Sr-only — screen-reader only text */
  .uikit-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border-width: 0; }
`;

export function UiKitProvider({ children }) {
  const [confirmReq, setConfirmReq] = useState(null);     // { title, message, danger, onResolve }
  const [promptReq, setPromptReq]   = useState(null);     // { title, label, defaultValue, onResolve }
  const [toasts, setToasts]         = useState([]);       // [{id, message, kind, action, ttl}]

  const confirm = useCallback(({ title = "Konfirmasi", message = "Apakah Anda yakin?", danger = false, okLabel = "Lanjut", cancelLabel = "Batal" } = {}) => {
    return new Promise((resolve) => setConfirmReq({ title, message, danger, okLabel, cancelLabel, onResolve: resolve }));
  }, []);

  const prompt = useCallback(({ title = "Input", label = "Nilai", defaultValue = "", placeholder = "", type = "text" } = {}) => {
    return new Promise((resolve) => setPromptReq({ title, label, defaultValue, placeholder, type, onResolve: resolve }));
  }, []);

  const toast = useCallback((message, kind = "ok", ttl = 2500) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(p => [...p, { id, message, kind, ttl }]);
    if (ttl > 0) setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), ttl);
    return id;
  }, []);

  const undoToast = useCallback((message, undoFn, ttl = 5000) => {
    const id = Math.random().toString(36).slice(2);
    let undone = false;
    const action = {
      label: "↶ Undo",
      fn: () => { if (!undone) { undone = true; undoFn?.(); setToasts(p => p.filter(t => t.id !== id)); } },
    };
    setToasts(p => [...p, { id, message, kind: "undo", ttl, action }]);
    if (ttl > 0) setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), ttl);
    return id;
  }, []);

  const dismissToast = useCallback((id) => setToasts(p => p.filter(t => t.id !== id)), []);

  // ESC to close confirm/prompt
  useEffect(() => {
    if (!confirmReq && !promptReq) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        if (confirmReq) { confirmReq.onResolve(false); setConfirmReq(null); }
        if (promptReq)  { promptReq.onResolve(null);  setPromptReq(null); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirmReq, promptReq]);

  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [registeredShortcuts, setRegisteredShortcuts] = useState({});
  const registerShortcut = useCallback((key, desc) => {
    setRegisteredShortcuts(p => ({ ...p, [key]: desc }));
  }, []);
  // Global ? to open shortcut help
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target.tagName || "").toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "?" || (e.shiftKey && e.key === "/")) { e.preventDefault(); setShortcutsOpen(o => !o); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <UiKitContext.Provider value={{ confirm, prompt, toast, undoToast, dismissToast, registerShortcut }}>
      <style>{GLOBAL_CSS}</style>
      {children}
      {/* Confirm Dialog */}
      {confirmReq && (
        <div onClick={() => { confirmReq.onResolve(false); setConfirmReq(null); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 99998, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: `2px solid ${confirmReq.danger ? "#ef4444" : "#3b82f6"}`, borderRadius: 14, padding: 24, maxWidth: 420, fontFamily: "'Inter',sans-serif", color: "#fff", boxShadow: `0 0 60px ${confirmReq.danger ? "#ef4444" : "#3b82f6"}33` }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>{confirmReq.danger ? "⚠️" : "❓"}</div>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 6 }}>{confirmReq.title}</div>
            <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 18, lineHeight: 1.5 }}>{confirmReq.message}</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { confirmReq.onResolve(false); setConfirmReq(null); }} autoFocus
                style={{ flex: 1, background: "#1b212c", border: "1px solid #2a2b30", color: "#9ca3af", padding: "11px 18px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                {confirmReq.cancelLabel}
              </button>
              <button onClick={() => { confirmReq.onResolve(true); setConfirmReq(null); }}
                style={{ flex: 1, background: confirmReq.danger ? "#ef4444" : "#3b82f6", border: "none", color: "#fff", padding: "11px 18px", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                {confirmReq.okLabel}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Prompt Dialog */}
      {promptReq && <PromptDialog req={promptReq} onClose={() => setPromptReq(null)} />}
      {/* Toast Stack */}
      <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", zIndex: 99999, display: "flex", flexDirection: "column", gap: 8, alignItems: "center", pointerEvents: "none" }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            background: t.kind === "err" ? "#7f1d1d" : t.kind === "undo" ? "#1e293b" : t.kind === "warn" ? "#854d0e" : "#14532d",
            border: `1px solid ${t.kind === "err" ? "#ef4444" : t.kind === "undo" ? "#3b82f6" : t.kind === "warn" ? "#f59e0b" : "#22c55e"}`,
            color: "#fff", padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600, fontFamily: "'Inter',sans-serif",
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)", display: "flex", gap: 12, alignItems: "center", pointerEvents: "auto",
            animation: "uiKitToastIn 0.25s ease-out",
          }}>
            <span>{t.message}</span>
            {t.action && (
              <button onClick={() => t.action.fn()}
                style={{ background: "#3b82f6", border: "none", color: "#fff", padding: "5px 12px", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                {t.action.label}
              </button>
            )}
            <button onClick={() => dismissToast(t.id)} style={{ background: "transparent", border: "none", color: "#9ca3af", fontSize: 16, cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
          </div>
        ))}
      </div>
      {/* Keyboard shortcuts overlay (press ? to toggle) */}
      {shortcutsOpen && (
        <div onClick={() => setShortcutsOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 99997, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, animation: "uiKitFadeIn 0.2s ease-out" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "2px solid #3b82f6", borderRadius: 14, padding: 24, maxWidth: 540, width: "100%", fontFamily: "'Inter',sans-serif", color: "#fff" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>⌨️ Keyboard Shortcuts</div>
              <button onClick={() => setShortcutsOpen(false)} aria-label="Tutup"
                style={{ background: "transparent", border: "1px solid #2a2b30", color: "#9ca3af", padding: "3px 9px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit" }}>×</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 16px", fontSize: 13 }}>
              <kbd style={kbdStyle}>?</kbd><span style={{ color: "#9ca3af" }}>Toggle keyboard shortcuts overlay</span>
              <kbd style={kbdStyle}>/</kbd><span style={{ color: "#9ca3af" }}>Focus search bar</span>
              <kbd style={kbdStyle}>Ctrl+N</kbd><span style={{ color: "#9ca3af" }}>New item (di modul yang support)</span>
              <kbd style={kbdStyle}>Ctrl+S</kbd><span style={{ color: "#9ca3af" }}>Save form</span>
              <kbd style={kbdStyle}>Esc</kbd><span style={{ color: "#9ca3af" }}>Close modal / cancel</span>
              <kbd style={kbdStyle}>Enter</kbd><span style={{ color: "#9ca3af" }}>Submit form / confirm prompt</span>
              {Object.entries(registeredShortcuts).map(([k, d]) => (
                <span key={k} style={{ display: "contents" }}>
                  <kbd style={kbdStyle}>{k}</kbd><span style={{ color: "#9ca3af" }}>{d}</span>
                </span>
              ))}
            </div>
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid #2a2b30", fontSize: 11, color: "#6b7280", textAlign: "center" }}>
              Tip: tekan <kbd style={kbdStyle}>?</kbd> kapanpun untuk membuka panel ini
            </div>
          </div>
        </div>
      )}
    </UiKitContext.Provider>
  );
}

const kbdStyle = { background: "#0a0e16", border: "1px solid #2a2b30", borderBottom: "2px solid #2a2b30", padding: "3px 8px", borderRadius: 5, fontFamily: "'Geist Mono',monospace", fontSize: 11.5, color: "#fbbf24", minWidth: 32, textAlign: "center" };

function PromptDialog({ req, onClose }) {
  const [val, setVal] = useState(req.defaultValue || "");
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const submit = () => { req.onResolve(val); onClose(); };
  return (
    <div onClick={() => { req.onResolve(null); onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 99998, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "2px solid #3b82f6", borderRadius: 14, padding: 24, maxWidth: 460, width: "100%", fontFamily: "'Inter',sans-serif", color: "#fff" }}>
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 10 }}>{req.title}</div>
        <div style={{ fontSize: 11, color: "#5b6470", letterSpacing: 1, fontFamily: "'Geist Mono',monospace", marginBottom: 6 }}>{req.label}</div>
        <input ref={ref} type={req.type || "text"} value={val} onChange={e => setVal(e.target.value)} placeholder={req.placeholder || ""}
          onKeyDown={e => { if (e.key === "Enter") submit(); }}
          style={{ width: "100%", padding: "10px 14px", background: "#0a0e16", border: "1px solid #2a2b30", borderRadius: 9, color: "#fff", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button onClick={() => { req.onResolve(null); onClose(); }} style={{ flex: 1, background: "#1b212c", border: "1px solid #2a2b30", color: "#9ca3af", padding: "10px 16px", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Batal</button>
          <button onClick={submit} style={{ flex: 1, background: "#3b82f6", border: "none", color: "#fff", padding: "10px 16px", borderRadius: 9, fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>OK</button>
        </div>
      </div>
    </div>
  );
}

export function useUiKit() {
  const ctx = useContext(UiKitContext);
  if (!ctx) {
    console.warn("[uiKit] useUiKit dipanggil tanpa <UiKitProvider>. Pakai fallback.");
    return {
      confirm: ({ title, message } = {}) => Promise.resolve(window.confirm(`${title || ""}${message ? "\n" + message : ""}`)),
      prompt:  ({ title, defaultValue } = {}) => Promise.resolve(window.prompt(title || "", defaultValue || "")),
      toast:   (m) => console.log("[toast]", m),
      undoToast: (m) => console.log("[undoToast]", m),
      dismissToast: () => {},
    };
  }
  return ctx;
}

// ════════════════════════════════════════════════════════════════════
// COMPONENT: FormField — input wrapper dengan label, error, help
// ════════════════════════════════════════════════════════════════════
export function FormField({ label, error, help, required, wide, children }) {
  return (
    <div style={{ gridColumn: wide ? "span 2" : "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <label style={{ fontSize: 10, color: error ? "#ef4444" : "#5b6470", letterSpacing: 1, fontFamily: "'Geist Mono',monospace", fontWeight: error ? 700 : 400 }}>
          {label}{required && <span style={{ color: "#ef4444", marginLeft: 3 }}>*</span>}
        </label>
        {help && <Help text={help} />}
      </div>
      {children}
      {error && <div style={{ fontSize: 11, color: "#ef4444", marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>⚠ {error}</div>}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// COMPONENT: Help — ⓘ icon dengan tooltip
// ════════════════════════════════════════════════════════════════════
export function Help({ text }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <span onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)} onBlur={() => setShow(false)} tabIndex={0}
        role="button" aria-label="Help"
        style={{ width: 14, height: 14, borderRadius: "50%", background: "#3b82f622", border: "1px solid #3b82f666", color: "#3b82f6", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", cursor: "help", fontFamily: "'Geist Mono',monospace" }}>?</span>
      {show && (
        <span style={{ position: "absolute", left: "calc(100% + 6px)", top: "50%", transform: "translateY(-50%)",
          background: "#000", color: "#fff", fontSize: 11, padding: "5px 9px", borderRadius: 5,
          maxWidth: 240, whiteSpace: "normal", zIndex: 1000, pointerEvents: "none", lineHeight: 1.4,
          boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }}>{text}</span>
      )}
    </span>
  );
}

// ════════════════════════════════════════════════════════════════════
// COMPONENT: EmptyState
// ════════════════════════════════════════════════════════════════════
export function EmptyState({ icon = "📭", title = "Belum ada data", desc = "", action }) {
  return (
    <div style={{
      background: "#0d1117", border: `1px dashed ${C.border}`, borderRadius: 12,
      padding: "40px 20px", textAlign: "center", color: C.sub, fontFamily: "'Inter',sans-serif",
    }}>
      <div style={{ fontSize: 48, marginBottom: 10 }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#e6edf3", marginBottom: 6 }}>{title}</div>
      {desc && <div style={{ fontSize: 12.5, color: C.sub, lineHeight: 1.5, maxWidth: 400, margin: "0 auto 16px" }}>{desc}</div>}
      {action && (
        <button onClick={action.onClick} style={{ background: action.color || "#3b82f6", border: "none", color: "#fff", padding: "9px 22px", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginTop: 8 }}>
          {action.label}
        </button>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// COMPONENT: TooltipButton (button dengan hover tooltip)
// ════════════════════════════════════════════════════════════════════
export function TooltipButton({ tip, children, ...props }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <button {...props}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        title={tip}>{children}</button>
      {show && tip && (
        <span style={{
          position: "absolute", bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)",
          background: "#000", color: "#fff", fontSize: 11, padding: "5px 9px", borderRadius: 5,
          whiteSpace: "nowrap", zIndex: 1000, pointerEvents: "none",
          boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
        }}>{tip}</span>
      )}
    </span>
  );
}

// ════════════════════════════════════════════════════════════════════
// COMPONENT: LoadingSkeleton
// ════════════════════════════════════════════════════════════════════
export function LoadingSkeleton({ rows = 3, height = 40 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{
          height, background: "#0d1117", border: `1px solid ${C.border}`, borderRadius: 8,
          animation: `uiKitSkeleton 1.4s ease-in-out infinite`, opacity: 1 - i * 0.1,
        }} />
      ))}
      <style>{`@keyframes uiKitSkeleton { 0%,100% { opacity: 0.4; } 50% { opacity: 0.8; } }`}</style>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// COMPONENT: BulkActionBar (sticky bottom bar saat ada selection)
// ════════════════════════════════════════════════════════════════════
export function BulkActionBar({ count, actions = [], onClear }) {
  if (!count) return null;
  return (
    <div style={{
      position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)",
      background: "#0d1117", border: "1px solid #a855f766", borderRadius: 12,
      padding: "10px 16px", display: "flex", alignItems: "center", gap: 12,
      boxShadow: "0 8px 32px rgba(0,0,0,0.5)", zIndex: 9000, fontFamily: "'Inter',sans-serif",
    }}>
      <span style={{ color: "#a855f7", fontWeight: 800, fontFamily: "'Geist Mono',monospace" }}>{count}</span>
      <span style={{ color: "#9ca3af", fontSize: 13 }}>selected</span>
      <div style={{ width: 1, height: 20, background: "#2a2b30" }} />
      {actions.map((a, i) => (
        <button key={i} onClick={a.onClick} disabled={a.disabled}
          style={{ background: (a.color || "#a855f7") + "22", border: `1px solid ${(a.color || "#a855f7")}66`, color: a.color || "#a855f7", padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: a.disabled ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: a.disabled ? 0.5 : 1 }}>
          {a.icon} {a.label}
        </button>
      ))}
      <button onClick={onClear} style={{ background: "transparent", border: "1px solid #2a2b30", color: "#9ca3af", padding: "5px 11px", borderRadius: 7, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>× clear</button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// COMPONENT: StatHeader (kpi cards di header modul)
// ════════════════════════════════════════════════════════════════════
export function StatHeader({ stats = [] }) {
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
      {stats.map((s, i) => (
        <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderTop: `2px solid ${s.color || "#3b82f6"}`, borderRadius: 10, padding: "8px 14px", minWidth: 110, textAlign: "center" }}>
          <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 16, fontWeight: 800, color: s.color || "#3b82f6" }}>{s.value}</div>
          <div style={{ fontSize: 10, color: C.dim, letterSpacing: 0.5, marginTop: 2 }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// COMPONENT: SearchBar
// ════════════════════════════════════════════════════════════════════
export function SearchBar({ value, onChange, placeholder = "Cari…", shortcut = "/" }) {
  const ref = useRef(null);
  useKeyboardShortcut(shortcut, () => ref.current?.focus());
  return (
    <input ref={ref} value={value} onChange={e => onChange(e.target.value)} placeholder={`🔍 ${placeholder}  (tekan ${shortcut})`}
      style={{ width: "100%", padding: "10px 14px", background: "#0a0e16", border: `1px solid ${C.border}`, borderRadius: 10, color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
  );
}

// ════════════════════════════════════════════════════════════════════
// HOOK: useKeyboardShortcut
// ════════════════════════════════════════════════════════════════════
// Usage:
//   useKeyboardShortcut("n", () => openNewForm(), { ctrl: true });
//   useKeyboardShortcut("Escape", () => closeModal());
//   useKeyboardShortcut("/", () => searchRef.current?.focus());
export function useKeyboardShortcut(key, handler, opts = {}) {
  useEffect(() => {
    const isMac = navigator.platform.toUpperCase().includes("MAC");
    const onKey = (e) => {
      const tag = (e.target.tagName || "").toUpperCase();
      // Skip when typing in input/textarea unless explicit ctrl/meta
      if ((tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") && !e.ctrlKey && !e.metaKey && key !== "Escape") return;
      const ctrlMatch = opts.ctrl ? (e.ctrlKey || e.metaKey) : true;
      const shiftMatch = opts.shift !== undefined ? !!e.shiftKey === !!opts.shift : true;
      if (e.key === key && ctrlMatch && shiftMatch) {
        e.preventDefault();
        handler(e);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line
  }, [key, handler]);
}

// ════════════════════════════════════════════════════════════════════
// CONST: shared theme
// ════════════════════════════════════════════════════════════════════
export const theme = {
  card: "#0d1117", border: "#1b212c", sub: "#9ca3af", dim: "#5b6470", text: "#e6edf3",
  // Button style helpers
  btnPrimary:   { background: "#10b981", border: "none", color: "#04130c", padding: "9px 18px", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnSecondary: { background: "#1b212c", border: "1px solid #2a2b30", color: "#9ca3af", padding: "9px 18px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  btnDanger:    { background: "#ef4444", border: "none", color: "#fff", padding: "9px 18px", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  // Mini icon-button helper (with tooltip integration via TooltipButton)
  btnIcon: (color = "#a855f7") => ({ background: color + "18", border: `1px solid ${color}44`, color, padding: "4px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }),
  inp: { width: "100%", padding: "8px 11px", background: "#0a0e16", border: "1px solid #1b212c", borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", outline: "none" },
};
