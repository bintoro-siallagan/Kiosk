// karyaOS — Shared UI Library
// Standard components untuk konsistensi UX di seluruh admin module.
//
// Provider: <UiKitProvider> wrapped di main.jsx
// Hook: const { confirm, toast, undoToast, prompt } = useUiKit();
//
// Components: <EmptyState> · <TooltipButton> · <LoadingSkeleton> · <LoadingState>
//             · <BulkActionBar> · <StatHeader> · <SearchBar>
//             · <CrudButtons> · <EditModal>
//
// Hooks: useKeyboardShortcut(key, handler, deps)
//        useCrud({ apiBase, path, onChange, labelKey, idKey })
//
// CRUD pattern (DRY — < 100 LOC per module):
//   const crud = useCrud({ apiBase, path: "/api/foo", onChange: load });
//   // In list: <CrudButtons onEdit={() => crud.openEdit(row)} onDelete={() => crud.remove(row)} />
//   // At end: <EditModal open={!!crud.editing} data={crud.editing} onChange={crud.setEditing}
//   //           onClose={crud.cancel} onSave={crud.save} title={`Edit — ${crud.editing?.name}`}
//   //           fields={[
//   //             { key: "name", label: "Nama", required: true, span: 2 },
//   //             { key: "qty", label: "Qty", type: "number" },
//   //             { key: "status", label: "Status", type: "select", options: [["a","A"],["b","B"]] },
//   //           ]} />
//   // Add button: <button onClick={() => crud.openNew({ status: "draft" })}>+ Tambah</button>

import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from "react";

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

  const confirm = useCallback(({ title = "Confirm", message = "Are you sure?", danger = false, okLabel = "Continue", cancelLabel = "Cancel" } = {}) => {
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
              <button onClick={() => setShortcutsOpen(false)} aria-label="Close"
                style={{ background: "transparent", border: "1px solid #2a2b30", color: "#9ca3af", padding: "3px 9px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit" }}>×</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 16px", fontSize: 13 }}>
              <kbd style={ckKbd}>?</kbd><span style={{ color: "#9ca3af" }}>Toggle keyboard shortcuts overlay</span>
              <kbd style={ckKbd}>/</kbd><span style={{ color: "#9ca3af" }}>Focus search bar</span>
              <kbd style={ckKbd}>Ctrl+N</kbd><span style={{ color: "#9ca3af" }}>New item (di modul yang support)</span>
              <kbd style={ckKbd}>Ctrl+S</kbd><span style={{ color: "#9ca3af" }}>Save form</span>
              <kbd style={ckKbd}>Esc</kbd><span style={{ color: "#9ca3af" }}>Close modal / cancel</span>
              <kbd style={ckKbd}>Enter</kbd><span style={{ color: "#9ca3af" }}>Submit form / confirm prompt</span>
              {Object.entries(registeredShortcuts).map(([k, d]) => (
                <span key={k} style={{ display: "contents" }}>
                  <kbd style={ckKbd}>{k}</kbd><span style={{ color: "#9ca3af" }}>{d}</span>
                </span>
              ))}
            </div>
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid #2a2b30", fontSize: 11, color: "#6b7280", textAlign: "center" }}>
              Tip: press <kbd style={ckKbd}>?</kbd> anytime to open this panel
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
          <button onClick={() => { req.onResolve(null); onClose(); }} style={{ flex: 1, background: "#1b212c", border: "1px solid #2a2b30", color: "#9ca3af", padding: "10px 16px", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
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
export function EmptyState({ icon = "📭", title = "No data yet", desc = "", action }) {
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
        aria-label={typeof tip === "string" ? tip : (props["aria-label"] || "")}
        title={tip}>{children}</button>
      {show && tip && (
        <span role="tooltip" style={{
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
// COMPONENT: ValidatedInput — input dengan validation + visual error
// ════════════════════════════════════════════════════════════════════
export function ValidatedInput({ value, onChange, validate, error: extError, ...rest }) {
  const [touched, setTouched] = useState(false);
  const localError = touched && validate ? validate(value) : null;
  const error = extError || localError;
  return (
    <>
      <input value={value} onChange={onChange} onBlur={() => setTouched(true)}
        className={error ? "uikit-input-error" : ""}
        aria-invalid={!!error} aria-describedby={error ? `err-${rest.name || rest.id}` : undefined}
        style={{ width: "100%", padding: "8px 11px", background: "#0a0e16", border: `1px solid ${error ? "#ef4444" : "#1b212c"}`, borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", outline: "none" }}
        {...rest} />
      {error && <div id={`err-${rest.name || rest.id}`} role="alert" style={{ fontSize: 11, color: "#ef4444", marginTop: 4 }}>⚠ {error}</div>}
    </>
  );
}

// Helper validators
export const validators = {
  required: (v) => !v || (typeof v === "string" && !v.trim()) ? "This field is required" : null,
  email:    (v) => v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? "Invalid email format" : null,
  phone:    (v) => v && !/^[0-9+\-\s]{8,}$/.test(v) ? "Invalid phone number format" : null,
  min:      (n) => (v) => v != null && Number(v) < n ? `Minimum ${n}` : null,
  max:      (n) => (v) => v != null && Number(v) > n ? `Maximum ${n}` : null,
  minLen:   (n) => (v) => v && v.length < n ? `Minimum ${n} karakter` : null,
  pwd:      (v) => {
    if (!v || v.length < 8) return "Min 8 karakter";
    if (!/[A-Z]/.test(v)) return "Butuh huruf besar (A-Z)";
    if (!/[a-z]/.test(v)) return "Butuh huruf kecil (a-z)";
    if (!/[0-9]/.test(v)) return "Butuh angka (0-9)";
    return null;
  },
};

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
// COMPONENT: LoadingState (spinner + label, brand-aware)
// ════════════════════════════════════════════════════════════════════
export function LoadingState({ label = "Memuat…", sub = "", compact = false }) {
  const size = compact ? 16 : 28;
  return (
    <div style={{
      display: "flex", flexDirection: compact ? "row" : "column",
      alignItems: "center", justifyContent: "center",
      gap: compact ? 10 : 14,
      padding: compact ? "10px 12px" : "44px 20px",
      color: C.sub, fontFamily: "'Inter',sans-serif",
    }}>
      <div style={{
        width: size, height: size,
        border: `2px solid ${C.border}`, borderTopColor: "#3b82f6",
        borderRadius: "50%", animation: "uiKitSpin 0.8s linear infinite",
        flexShrink: 0,
      }} />
      <div style={{ textAlign: compact ? "left" : "center" }}>
        <div style={{ fontSize: compact ? 13 : 14, fontWeight: 600, color: C.text }}>{label}</div>
        {sub && !compact && <div style={{ fontSize: 12, color: C.sub, marginTop: 4 }}>{sub}</div>}
      </div>
      <style>{`@keyframes uiKitSpin { to { transform: rotate(360deg); } }`}</style>
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
export function SearchBar({ value, onChange, placeholder = "Search…", shortcut = "/" }) {
  const ref = useRef(null);
  useKeyboardShortcut(shortcut, () => ref.current?.focus());
  return (
    <input ref={ref} value={value} onChange={e => onChange(e.target.value)} placeholder={`🔍 ${placeholder}  (press ${shortcut})`}
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
// ════════════════════════════════════════════════════════════════════
// CRUD HELPERS — <CrudButtons>, <EditModal>, useCrud hook
// Bikin CRUD module jadi <100 LOC instead of ~300.
// ════════════════════════════════════════════════════════════════════

// Drop-in row action buttons: Edit (amber) + Delete (red).
// Usage:  <CrudButtons onEdit={() => setEditing(row)} onDelete={() => remove(row)} />
export function CrudButtons({ onEdit, onDelete, editTitle = "Edit", deleteTitle = "Delete", size = "sm", style = {} }) {
  const padding = size === "sm" ? "3px 7px" : "5px 10px";
  const fontSize = size === "sm" ? 11 : 12;
  return (
    <span style={{ display: "inline-flex", gap: 4, ...style }}>
      {onEdit && (
        <button onClick={onEdit} title={editTitle}
          style={{ background: "#f59e0b18", border: "1px solid #f59e0b44", color: "#f59e0b", padding, borderRadius: 5, fontSize, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>✏️</button>
      )}
      {onDelete && (
        <button onClick={onDelete} title={deleteTitle}
          style={{ background: "#ef444418", border: "1px solid #ef444444", color: "#ef4444", padding, borderRadius: 5, fontSize, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>🗑️</button>
      )}
    </span>
  );
}

// Generic edit modal. Fields config:
//   [{ key, label, type?: "text|number|select|date|textarea|checkbox", options?, placeholder?, required?, span?: 1|2, readOnly? }]
// Type "select" uses options as [[value, label], ...].
// `span: 2` makes the field full-width (default 1 = half-width on 2-col grid).
export function EditModal({ open, title, data, fields = [], onChange, onClose, onSave, saveLabel = "💾 Save", cancelLabel = "Cancel", maxWidth = 540, banner = null }) {
  if (!open || !data) return null;
  const set = (k, v) => onChange({ ...data, [k]: v });
  const inp = {
    background: "#0a0e16", border: "1px solid #30363d", borderRadius: 7,
    padding: "8px 11px", color: "#e6edf3", fontSize: 13, fontFamily: "inherit",
    outline: "none", boxSizing: "border-box", width: "100%",
  };
  const lbl = { fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4, fontFamily: "'Geist Mono',monospace", fontWeight: 700 };

  const renderField = (f) => {
    const v = data[f.key] ?? "";
    if (f.type === "select") {
      return (
        <select value={v} onChange={e => set(f.key, e.target.value)} style={inp} disabled={f.readOnly}>
          {(f.options || []).map(([val, lab]) => <option key={val} value={val}>{lab}</option>)}
        </select>
      );
    }
    if (f.type === "textarea") {
      return <textarea value={v} onChange={e => set(f.key, e.target.value)} placeholder={f.placeholder || ""} rows={f.rows || 3} readOnly={f.readOnly} style={{ ...inp, resize: "vertical" }} />;
    }
    if (f.type === "checkbox") {
      return (
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#9ca3af", cursor: f.readOnly ? "not-allowed" : "pointer", paddingTop: 6 }}>
          <input type="checkbox" checked={!!v} disabled={f.readOnly} onChange={e => set(f.key, e.target.checked ? 1 : 0)} /> {f.checkboxLabel || ""}
        </label>
      );
    }
    if (f.type === "date") {
      // accept either YYYY-MM-DD string or unix seconds
      const dateStr = typeof v === "number"
        ? new Date(v * 1000).toISOString().slice(0, 10)
        : (typeof v === "string" && v.length >= 10 ? v.slice(0, 10) : "");
      return <input type="date" value={dateStr} onChange={e => set(f.key, e.target.value)} readOnly={f.readOnly} style={inp} />;
    }
    return (
      <input
        type={f.type || "text"}
        value={v}
        onChange={e => set(f.key, f.type === "number" ? Number(e.target.value) : e.target.value)}
        placeholder={f.placeholder || ""}
        readOnly={f.readOnly}
        style={inp}
      />
    );
  };

  return (
    <div onClick={onClose} className="uikit-modal" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20, animation: "uiKitFadeIn .15s ease-out" }}>
      <div onClick={e => e.stopPropagation()} className="uikit-modal-card" style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 12, padding: 22, maxWidth, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 14 }}>✏️ {title}</div>
        {banner && (
          <div style={{ background: "#fef3c715", border: "1px solid #fbbf2444", color: "#fbbf24", padding: "8px 12px", borderRadius: 7, fontSize: 11.5, marginBottom: 12 }}>
            {banner}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }} className="uikit-grid-2">
          {fields.map(f => (
            <div key={f.key} style={{ gridColumn: f.span === 2 ? "1 / -1" : undefined }}>
              <div style={lbl}>{f.label}{f.required ? " *" : ""}</div>
              {renderField(f)}
              {f.help && <div style={{ fontSize: 10.5, color: "#5b6470", marginTop: 3 }}>{f.help}</div>}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={{ background: "#161b22", border: "1px solid #30363d", color: "#9ca3af", padding: "8px 14px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>{cancelLabel}</button>
          <button onClick={onSave} style={{ background: "#10b981", color: "#04130c", border: "none", padding: "8px 18px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>{saveLabel}</button>
        </div>
      </div>
    </div>
  );
}

// useCrud — boilerplate-free CRUD wiring. Pulls in confirm/toast from uiKit.
// Usage:
//   const crud = useCrud({ apiBase, path: "/api/supplier-master", onChange: load, labelKey: "name" });
//   ...
//   <CrudButtons onEdit={() => crud.openEdit(row)} onDelete={() => crud.remove(row)} />
//   <EditModal open={!!crud.editing} ... onChange={crud.setEditing} onSave={crud.save} onClose={crud.cancel} fields={[...]} />
export function useCrud({ apiBase = "", path, onChange, labelKey = "name", idKey = "id" }) {
  const { confirm, toast } = useUiKit();
  const [editing, setEditing] = useState(null);

  const openEdit = (row) => setEditing({ ...row });
  const cancel = () => setEditing(null);

  const save = async () => {
    if (!editing) return;
    const isNew = !editing[idKey];
    const url = isNew ? `${apiBase}${path}` : `${apiBase}${path}/${editing[idKey]}`;
    const res = await fetch(url, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing),
    });
    const j = await res.json().catch(() => ({}));
    if (j.ok || j.id || res.ok) {
      toast(isNew ? "Added" : "Saved", "success");
      setEditing(null);
      if (onChange) await onChange();
    } else {
      toast(j.error || "Gagal", "error");
    }
  };

  const remove = async (row, opts = {}) => {
    const label = row[labelKey] || row.title || row.code || `#${row[idKey]}`;
    const ok = await confirm({
      title: opts.title || `Delete "${label}"?`,
      message: opts.message || "Akan dihapus permanen. Tidak bisa dibatalkan.",
      danger: true,
      okLabel: opts.okLabel || "Delete",
    });
    if (!ok) return false;
    const res = await fetch(`${apiBase}${path}/${row[idKey]}`, { method: "DELETE" });
    const j = await res.json().catch(() => ({}));
    if (j.ok || res.ok) {
      toast("Dihapus", "success");
      if (onChange) await onChange();
      return true;
    }
    toast(j.error || "Gagal hapus", "error");
    return false;
  };

  const openNew = (defaults = {}) => setEditing({ ...defaults });

  return { editing, setEditing, openEdit, openNew, cancel, save, remove };
}

// ════════════════════════════════════════════════════════════════════
// COMMAND PALETTE — Cmd+K Apple-style universal search
// Usage:
//   <CommandPalette
//     items={[{ id, title, subtitle?, icon?, kbd?, onSelect }]}
//     placeholder="Cari modul, action…"
//     hotkey="k"        // default "k" (Cmd+K / Ctrl+K)
//   />
//
// Auto-binds Cmd+K / Ctrl+K to open. Esc closes. ↑↓ navigate. Enter selects.
// ════════════════════════════════════════════════════════════════════
export function CommandPalette({ items = [], placeholder = "Search modules, actions, or type a command…", hotkey = "k", recentKey = "ck-recents" }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const [recents, setRecents] = useState(() => {
    try { return JSON.parse(localStorage.getItem(recentKey) || "[]"); } catch { return []; }
  });

  // Open via Cmd+K / Ctrl+K
  useEffect(() => {
    const onKey = (e) => {
      const isModKey = e.metaKey || e.ctrlKey;
      if (isModKey && e.key.toLowerCase() === hotkey.toLowerCase()) {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [hotkey]);

  // Focus input + reset cursor on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Filter items
  const filtered = useMemo(() => {
    if (!query.trim()) {
      // Show recents first, then all items
      const recentMap = new Map(recents.map((r, i) => [r, i]));
      const recentItems = items.filter(it => recentMap.has(it.id));
      recentItems.sort((a, b) => recentMap.get(a.id) - recentMap.get(b.id));
      const rest = items.filter(it => !recentMap.has(it.id));
      return [...recentItems, ...rest].slice(0, 50);
    }
    const q = query.toLowerCase().trim();
    const tokens = q.split(/\s+/);
    const scored = items
      .map(it => {
        const hay = `${it.title || ""} ${it.subtitle || ""} ${it.keywords || ""}`.toLowerCase();
        let score = 0;
        for (const t of tokens) {
          if (!t) continue;
          if (hay.startsWith(t)) score += 30;
          else if (hay.includes(" " + t)) score += 18;
          else if (hay.includes(t)) score += 8;
          else return null;
        }
        // Title boost
        if ((it.title || "").toLowerCase().includes(q)) score += 12;
        return { it, score };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .map(x => x.it)
      .slice(0, 50);
    return scored;
  }, [items, query, recents]);

  // Keep cursor in range
  useEffect(() => { if (cursor >= filtered.length) setCursor(Math.max(0, filtered.length - 1)); }, [filtered.length, cursor]);

  // Scroll cursor into view
  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    if (!list) return;
    const active = list.querySelector('[data-active="true"]');
    if (active) active.scrollIntoView({ block: "nearest" });
  }, [cursor, open]);

  const close = () => setOpen(false);
  const select = (item) => {
    if (!item) return;
    // Save recent
    setRecents(prev => {
      const next = [item.id, ...prev.filter(id => id !== item.id)].slice(0, 8);
      try { localStorage.setItem(recentKey, JSON.stringify(next)); } catch {}
      return next;
    });
    close();
    item.onSelect?.();
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor(c => Math.min(filtered.length - 1, c + 1)); return; }
    if (e.key === "ArrowUp")   { e.preventDefault(); setCursor(c => Math.max(0, c - 1)); return; }
    if (e.key === "Enter")     { e.preventDefault(); select(filtered[cursor]); return; }
  };

  if (!open) return null;

  return (
    <div onClick={close} role="dialog" aria-modal="true" aria-label="Command palette"
      style={{
        position: "fixed", inset: 0, zIndex: 99999,
        background: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        paddingTop: "12vh", paddingLeft: 20, paddingRight: 20,
        animation: "uiKitFadeIn 0.15s ease-out",
      }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "100%", maxWidth: 640,
        background: "linear-gradient(180deg,#15171c 0%,#0d0f14 100%)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 16, overflow: "hidden",
        boxShadow: "0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.06)",
        fontFamily: "'Inter','SF Pro Display',system-ui,-apple-system,sans-serif",
        color: "#fff",
        animation: "ck-pop 0.18s cubic-bezier(0.18,1.05,0.4,1) both",
      }}>
        {/* Search input */}
        <div style={{ display: "flex", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <span style={{ fontSize: 18, marginRight: 10, opacity: 0.55 }}>⌘</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setCursor(0); }}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            spellCheck={false}
            autoComplete="off"
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              color: "#fff", fontSize: 15, fontFamily: "inherit", padding: 0,
              letterSpacing: -0.2,
            }}
          />
          <kbd style={ckKbd}>ESC</kbd>
        </div>

        {/* Results list */}
        <div ref={listRef} style={{ maxHeight: "55vh", overflowY: "auto", padding: "6px 0" }}>
          {filtered.length === 0 ? (
            <div style={{ padding: "30px 20px", textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
              No results for <b style={{ color: "rgba(255,255,255,0.7)" }}>"{query}"</b>
            </div>
          ) : (
            <>
              {!query.trim() && recents.length > 0 && (
                <div style={ckGroupLabel}>TERAKHIR DIBUKA</div>
              )}
              {filtered.map((it, i) => {
                // Insert divider between recents and rest
                const showAllLabel = !query.trim() && recents.length > 0 && i === recents.length;
                return (
                  <span key={it.id}>
                    {showAllLabel && <div style={ckGroupLabel}>SEMUA MODUL</div>}
                    <div
                      data-active={cursor === i}
                      onMouseEnter={() => setCursor(i)}
                      onClick={() => select(it)}
                      style={{
                        ...ckItem,
                        background: cursor === i ? "rgba(245,158,11,0.1)" : "transparent",
                        borderLeft: cursor === i ? "2px solid #fbbf24" : "2px solid transparent",
                      }}>
                      <span style={ckItemIcon}>{it.icon || "▸"}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", letterSpacing: -0.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title}</div>
                        {it.subtitle && (
                          <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.45)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.subtitle}</div>
                        )}
                      </span>
                      {it.kbd && <kbd style={ckKbd}>{it.kbd}</kbd>}
                      {cursor === i && <span style={{ fontSize: 11, color: "#fbbf24", fontFamily: "'Geist Mono',monospace", fontWeight: 700, letterSpacing: 1, marginLeft: 8 }}>↵</span>}
                    </div>
                  </span>
                );
              })}
            </>
          )}
        </div>

        {/* Footer hint */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "10px 16px", borderTop: "1px solid rgba(255,255,255,0.06)",
          fontSize: 11, color: "rgba(255,255,255,0.4)",
          fontFamily: "'Geist Mono',monospace", letterSpacing: 0.5,
        }}>
          <span style={{ display: "flex", gap: 14 }}>
            <span><kbd style={ckKbdSm}>↑↓</kbd> Navigate</span>
            <span><kbd style={ckKbdSm}>↵</kbd> Select</span>
            <span><kbd style={ckKbdSm}>ESC</kbd> Close</span>
          </span>
          <span>{filtered.length} result{filtered.length === 1 ? "" : "s"}</span>
        </div>

        <style>{`
          @keyframes ck-pop {
            from { opacity: 0; transform: scale(0.96) translateY(-8px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
          }
        `}</style>
      </div>
    </div>
  );
}

const ckItem = {
  display: "flex", alignItems: "center", gap: 12,
  padding: "10px 18px",
  cursor: "pointer",
  transition: "background 0.1s ease, border-color 0.1s ease",
  fontFamily: "inherit",
};
const ckItemIcon = {
  width: 28, height: 28, borderRadius: 7,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.06)",
  display: "flex", alignItems: "center", justifyContent: "center",
  fontSize: 14, flexShrink: 0,
};
const ckGroupLabel = {
  fontSize: 10, color: "rgba(255,255,255,0.35)",
  fontFamily: "'Geist Mono',monospace", letterSpacing: 1.5, fontWeight: 700,
  textTransform: "uppercase",
  padding: "10px 20px 4px",
};
const ckKbd = {
  fontSize: 10, padding: "2px 8px", borderRadius: 5,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "rgba(255,255,255,0.5)",
  fontFamily: "'Geist Mono',monospace", fontWeight: 700, letterSpacing: 0.5,
};
const ckKbdSm = {
  fontSize: 9, padding: "1px 6px", borderRadius: 4,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "rgba(255,255,255,0.5)",
  fontFamily: "'Geist Mono',monospace", fontWeight: 700,
  marginRight: 5,
};

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
