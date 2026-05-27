// src/Admin/AdminQueueSettings.jsx
// Queue number settings — marketing offset, padding, prefix.
// Edit start offset to make queue feel busier (e.g. start at #051 instead of #001).

import { useEffect, useState, useCallback } from "react";

const KEYS = [
  { k: "QUEUE_START_OFFSET", label: "Start offset", hint: "Tambahin offset ke queue number. Marketing trick: bikin kelihatan udah rame (e.g. 50 → first customer dapat #051).", type: "number", min: 0, max: 9999 },
  { k: "QUEUE_PADDING", label: "Digit count", hint: "Banyak digit queue. Padding=3 → 001, 002, ... Padding=4 → 0001, 0002, ...", type: "number", min: 1, max: 6 },
  { k: "QUEUE_PREFIX", label: "Prefix", hint: 'Prefix string. Kosong = no prefix. E.g. "A-" → A-051. JSON-quoted: "X" atau "".', type: "text" },
];

export default function AdminQueueSettings({ onBack }) {
  const [cfg, setCfg] = useState({});
  const [busy, setBusy] = useState({});
  const [preview, setPreview] = useState({ offset: 0, padding: 3, prefix: "" });

  const load = useCallback(() => {
    Promise.all(KEYS.map(({ k }) =>
      fetch(`/api/pos/config/${k}`).then(r => r.ok ? r.json() : null).catch(() => null)
    )).then(rows => {
      const map = {};
      rows.forEach((r, i) => {
        if (!r) return;
        map[KEYS[i].k] = r.parsed_value !== undefined ? r.parsed_value : r.value;
      });
      setCfg(map);
      setPreview({
        offset: parseInt(map.QUEUE_START_OFFSET, 10) || 0,
        padding: parseInt(map.QUEUE_PADDING, 10) || 3,
        prefix: typeof map.QUEUE_PREFIX === "string" ? map.QUEUE_PREFIX : "",
      });
    });
  }, []);
  useEffect(load, [load]);

  async function save(key, value) {
    setBusy(b => ({ ...b, [key]: true }));
    try {
      const r = await fetch(`/api/pos/config/${key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value, updated_by: "admin" }),
      });
      if (!r.ok) throw new Error((await r.json()).error || `HTTP ${r.status}`);
      load();
    } catch (e) { alert("✗ " + e.message); }
    finally { setBusy(b => ({ ...b, [key]: false })); }
  }

  function makePreview() {
    const num = (1 + (preview.offset || 0));
    return (preview.prefix || "") + String(num).padStart(preview.padding || 3, "0");
  }

  return (
    <div style={S.root}>
      <header style={S.header}>
        {onBack && <button onClick={onBack} style={S.backBtn}>← Back</button>}
        <h2 style={S.title}>Queue Number Settings</h2>
      </header>

      <div style={S.intro}>
        🎯 <b style={{ color: "#fff" }}>Marketing trick</b> — set start offset misalnya 50 → first customer hari ini dapat queue <b>#051</b>. Berasa udah rame.
        Reset otomatis tiap hari (midnight). Padding & prefix bisa disesuaikan.
      </div>

      <div style={S.previewCard}>
        <div style={S.previewLabel}>Next customer will receive</div>
        <div style={S.previewBig}>{makePreview()}</div>
      </div>

      <div style={S.form}>
        {KEYS.map(({ k, label, hint, type, min, max }) => {
          const val = cfg[k];
          return (
            <div key={k} style={S.field}>
              <label style={S.label}>{label}</label>
              <div style={{ display: "flex", gap: 10 }}>
                <input
                  type={type}
                  min={min} max={max}
                  value={val ?? ""}
                  onChange={e => setCfg(c => ({ ...c, [k]: type === "number" ? e.target.value : e.target.value }))}
                  onInput={e => {
                    // Live preview update
                    const v = type === "number" ? (parseInt(e.target.value, 10) || 0) : e.target.value;
                    setPreview(p => ({
                      ...p,
                      offset:  k === "QUEUE_START_OFFSET" ? v : p.offset,
                      padding: k === "QUEUE_PADDING" ? (parseInt(v, 10) || 3) : p.padding,
                      prefix:  k === "QUEUE_PREFIX" ? v : p.prefix,
                    }));
                  }}
                  style={S.input}
                />
                <button
                  onClick={() => {
                    const v = type === "number" ? (parseInt(val, 10) || 0) : (val || "");
                    save(k, v);
                  }}
                  disabled={busy[k]}
                  style={busy[k] ? { ...S.saveBtn, opacity: 0.5 } : S.saveBtn}>
                  {busy[k] ? "..." : "Save"}
                </button>
              </div>
              <div style={S.hint}>{hint}</div>
              <div style={S.currentVal}>
                Current saved: <code style={S.code}>{String(val ?? "(empty)")}</code>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const S = {
  root: { padding: "20px 24px", maxWidth: 720, margin: "0 auto", color: "#fff", fontFamily: "'Inter',sans-serif" },
  header: { display: "flex", alignItems: "center", gap: 14, marginBottom: 18 },
  backBtn: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)", padding: "7px 14px", borderRadius: 999, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "'Inter',sans-serif" },
  title: { margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: "-0.5px", color: "rgba(255,255,255,0.95)" },
  intro: {
    background: "rgba(255,255,255,0.025)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 14, padding: "14px 18px",
    fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.6,
    marginBottom: 20,
  },
  previewCard: {
    margin: "0 0 24px",
    padding: "22px 28px",
    borderRadius: 18,
    background: "radial-gradient(ellipse 90% 180% at 50% 100%, color-mix(in srgb, var(--brand-primary,#FF6B35) 55%, transparent), transparent 55%), linear-gradient(180deg, color-mix(in srgb, var(--brand-primary,#FF6B35) 38%, #1a1d29), color-mix(in srgb, var(--brand-secondary,#E55A2B) 30%, #0d0f14))",
    border: "1px solid rgba(255,255,255,0.16)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22), 0 8px 24px color-mix(in srgb, var(--brand-primary,#FF6B35) 22%, transparent)",
    textAlign: "center",
  },
  previewLabel: { fontSize: 10, fontWeight: 500, letterSpacing: 2, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", marginBottom: 8, textShadow: "0 1px 2px rgba(0,0,0,0.45)" },
  previewBig: { fontSize: 56, fontWeight: 700, letterSpacing: "-2px", color: "#fff", fontFamily: "'Inter',sans-serif", fontVariantNumeric: "tabular-nums", lineHeight: 1, textShadow: "0 4px 16px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.55)" },
  form: { display: "flex", flexDirection: "column", gap: 18 },
  field: {
    padding: 16,
    background: "linear-gradient(180deg,rgba(255,255,255,0.05) 0%,rgba(255,255,255,0.02) 60%,rgba(255,255,255,0.008) 100%)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 14,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12), 0 4px 14px rgba(0,0,0,0.22)",
  },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.92)", marginBottom: 8, letterSpacing: "-0.2px" },
  input: { flex: 1, padding: "11px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#fff", borderRadius: 12, fontSize: 15, fontFamily: "'Inter',sans-serif", outline: "none", letterSpacing: "-0.2px" },
  saveBtn: { padding: "11px 22px", border: "1px solid rgba(255,255,255,0.16)", background: "radial-gradient(ellipse 90% 180% at 50% 100%, color-mix(in srgb, var(--brand-primary,#FF6B35) 60%, transparent), transparent 55%), linear-gradient(180deg, color-mix(in srgb, var(--brand-primary,#FF6B35) 38%, #1a1d29), color-mix(in srgb, var(--brand-secondary,#E55A2B) 30%, #0d0f14))", color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,0.45)", borderRadius: 12, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "'Inter',sans-serif", letterSpacing: "-0.1px", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22), 0 4px 12px color-mix(in srgb, var(--brand-primary,#FF6B35) 22%, transparent)" },
  hint: { fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 8, lineHeight: 1.55, letterSpacing: "-0.1px" },
  currentVal: { fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 6 },
  code: { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.06)", padding: "2px 7px", borderRadius: 6, fontFamily: "'Inter',sans-serif", fontVariantNumeric: "tabular-nums", color: "rgba(255,255,255,0.8)" },
};
