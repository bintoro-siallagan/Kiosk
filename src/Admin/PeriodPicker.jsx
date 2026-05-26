// src/Admin/PeriodPicker.jsx
// Pemilih periode — preset cepat + range tanggal custom (dari–sampai).
// Emit { from, to } (unix detik) lewat onChange.

import { useState } from "react";

const startToday = () => Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
const nowSec = () => Math.floor(Date.now() / 1000);
const PRESETS = [
  { k: "today", label: "Hari Ini", from: () => startToday() },
  { k: "7d", label: "7 Hari", from: () => startToday() - 7 * 86400 },
  { k: "30d", label: "30 Hari", from: () => startToday() - 30 * 86400 },
  { k: "90d", label: "90 Hari", from: () => startToday() - 90 * 86400 },
];

const pill = { background: "#0d1117", border: "1px solid #21262d", color: "#9da7b3", fontSize: 12, padding: "7px 13px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit" };
const pillOn = { ...pill, background: "#3b82f6", border: "1px solid #3b82f6", color: "#fff", fontWeight: 700 };
const inp = { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 7, padding: "6px 9px", color: "#e6edf3", fontSize: 12, fontFamily: "inherit", outline: "none" };

export default function PeriodPicker({ onChange, defaultPreset = "30d" }) {
  const [active, setActive] = useState(defaultPreset);
  const [cFrom, setCFrom] = useState("");
  const [cTo, setCTo] = useState("");

  const pickPreset = (p) => { setActive(p.k); setCFrom(""); setCTo(""); onChange({ from: p.from(), to: nowSec() }); };
  const applyCustom = () => {
    if (!cFrom || !cTo) return;
    const from = Math.floor(new Date(cFrom + "T00:00:00").getTime() / 1000);
    const to = Math.floor(new Date(cTo + "T23:59:59").getTime() / 1000);
    if (from > to) return;
    setActive("custom");
    onChange({ from, to });
  };

  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
      {PRESETS.map(p => (
        <button key={p.k} onClick={() => pickPreset(p)} style={active === p.k ? pillOn : pill}>{p.label}</button>
      ))}
      <span style={{ color: "#5b6470", fontSize: 11, margin: "0 4px" }}>or pilih tanggal:</span>
      <input type="date" value={cFrom} onChange={e => setCFrom(e.target.value)} style={inp} />
      <span style={{ color: "#5b6470" }}>→</span>
      <input type="date" value={cTo} onChange={e => setCTo(e.target.value)} style={inp} />
      <button onClick={applyCustom} disabled={!cFrom || !cTo}
        style={{ ...(active === "custom" ? pillOn : pill), opacity: (!cFrom || !cTo) ? 0.45 : 1 }}>Terapkan</button>
    </div>
  );
}
