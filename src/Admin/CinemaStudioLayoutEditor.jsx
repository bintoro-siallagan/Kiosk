// karyaOS — Cinema Studio Seat Layout Editor
// Visual grid editor untuk admin custom layout: regular / void (aisle) /
// premium / couple / disabled / VIP. Click-to-paint dengan palette.
//
// Props:
//   studio    — { id, name, rows, cols, seat_map (JSON array or null) }
//   onClose() — close modal callback
//   onSaved() — refresh parent after save
//
// Seat-map JSON shape:
//   [
//     [ {type:'regular', label:'A1'} | {type:'void'} | null, ... ],  ← row 1
//     [ ... ],                                                         ← row 2
//   ]
//
// Backward compat: kalau studio.seat_map === null → generate dari rows × cols
// (semua regular, label A1..Z99). Editor save → backend PATCH /studios/:id.

import { useState, useEffect, useMemo, useCallback } from "react";

const API_HOST = import.meta.env.VITE_API_URL || "http://localhost:3001";

const ROW_LETTER = (i) => {
  // 0=A, 1=B, ..., 25=Z, 26=AA, 27=AB
  if (i < 26) return String.fromCharCode(65 + i);
  return String.fromCharCode(65 + Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26));
};

const SEAT_TYPES = [
  { key: "regular",  emoji: "💺", label: "Regular",  color: "#10b981", desc: "Kursi standar" },
  { key: "premium",  emoji: "👑", label: "Premium",  color: "#fbbf24", desc: "Recliner / sofa" },
  { key: "couple",   emoji: "💑", label: "Couple",   color: "#ec4899", desc: "Double / love-seat" },
  { key: "disabled", emoji: "♿", label: "Disabled", color: "#22d3ee", desc: "Aksesibilitas" },
  { key: "vip",      emoji: "⭐", label: "VIP",      color: "#a855f7", desc: "Premium plus" },
  { key: "void",     emoji: "⬜", label: "Aisle/Void", color: "#5b6470", desc: "Gang / kosong" },
];
const TYPE_BY_KEY = Object.fromEntries(SEAT_TYPES.map(t => [t.key, t]));

function generateDefaultMap(rows, cols) {
  const out = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      row.push({ type: "regular", label: `${ROW_LETTER(r)}${c + 1}` });
    }
    out.push(row);
  }
  return out;
}

export default function CinemaStudioLayoutEditor({ studio, onClose, onSaved }) {
  const [rows, setRows] = useState(studio?.rows || 8);
  const [cols, setCols] = useState(studio?.cols || 12);
  const [seatMap, setSeatMap] = useState(() => {
    if (studio?.seat_map) {
      try {
        const parsed = typeof studio.seat_map === "string" ? JSON.parse(studio.seat_map) : studio.seat_map;
        if (Array.isArray(parsed)) return parsed;
      } catch {}
    }
    return generateDefaultMap(studio?.rows || 8, studio?.cols || 12);
  });
  const [activeType, setActiveType] = useState("regular");
  const [paintMode, setPaintMode] = useState(false); // hold drag to paint
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // Adjust map to current rows × cols (preserve existing cells)
  const resizeMap = useCallback((newRows, newCols) => {
    setSeatMap(prev => {
      const out = [];
      for (let r = 0; r < newRows; r++) {
        const row = [];
        const prevRow = prev[r] || [];
        for (let c = 0; c < newCols; c++) {
          row.push(prevRow[c] || { type: "regular", label: `${ROW_LETTER(r)}${c + 1}` });
        }
        out.push(row);
      }
      return out;
    });
  }, []);

  useEffect(() => { resizeMap(rows, cols); }, [rows, cols, resizeMap]);

  const paintCell = (r, c) => {
    setSeatMap(prev => {
      const out = prev.map(row => row.slice());
      const t = TYPE_BY_KEY[activeType];
      if (activeType === "void") {
        out[r][c] = { type: "void" };
      } else {
        const label = out[r][c]?.label || `${ROW_LETTER(r)}${c + 1}`;
        out[r][c] = { type: activeType, label };
      }
      return out;
    });
  };

  const autoNumber = () => {
    // Re-generate labels: row letter + sequential per-row, skip voids
    setSeatMap(prev => {
      return prev.map((row, r) => {
        let seatNum = 1;
        return row.map(cell => {
          if (!cell || cell.type === "void") return cell;
          const label = `${ROW_LETTER(r)}${seatNum++}`;
          return { ...cell, label };
        });
      });
    });
  };

  const stats = useMemo(() => {
    const counts = {};
    let totalSeats = 0;
    for (const row of seatMap) for (const cell of row) {
      if (!cell || cell.type === "void") continue;
      counts[cell.type] = (counts[cell.type] || 0) + 1;
      totalSeats++;
    }
    return { counts, totalSeats };
  }, [seatMap]);

  const handleSave = async () => {
    setBusy(true); setMsg("");
    try {
      const r = await fetch(`${API_HOST}/api/cinema/studios/${studio.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, cols, seat_map: seatMap }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || "Gagal simpan");
      setMsg("✓ Layout tersimpan");
      onSaved && onSaved();
      setTimeout(() => onClose && onClose(), 600);
    } catch (e) {
      setMsg("⚠ " + e.message);
    }
    setBusy(false);
  };

  const handleReset = () => {
    if (!confirm("Reset semua kursi jadi Regular?")) return;
    setSeatMap(generateDefaultMap(rows, cols));
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "'Inter',sans-serif" }}>
      <div style={{ background: "linear-gradient(160deg,#050810 0%,#0c0f1a 50%,#08090f 100%)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 22, width: "100%", maxWidth: 1200, maxHeight: "94vh", overflowY: "auto", color: "#e6edf3", boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, gap: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.3 }}>🪑 Edit Layout Studio</div>
            <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 3 }}>{studio?.name} · {rows}×{cols} grid · {stats.totalSeats} kursi</div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#e6edf3", padding: "8px 14px", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>✕ Tutup</button>
        </div>

        {/* Controls row */}
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: "#7d8590", letterSpacing: 1, fontFamily: "'Geist Mono',monospace" }}>BARIS</span>
            <input type="number" min={1} max={26} value={rows} onChange={e => setRows(Math.max(1, Math.min(26, parseInt(e.target.value) || 1)))} style={inp} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: "#7d8590", letterSpacing: 1, fontFamily: "'Geist Mono',monospace" }}>KOLOM</span>
            <input type="number" min={1} max={30} value={cols} onChange={e => setCols(Math.max(1, Math.min(30, parseInt(e.target.value) || 1)))} style={inp} />
          </div>
          <button onClick={autoNumber} style={btnSecondary}>🔢 Auto-Number</button>
          <button onClick={handleReset} style={btnDanger}>↻ Reset Semua</button>
          <div style={{ flex: 1 }} />
          {msg && <span style={{ fontSize: 12, color: msg.startsWith("✓") ? "#10b981" : "#fca5a5" }}>{msg}</span>}
          <button onClick={handleSave} disabled={busy} style={btnPrimary}>{busy ? "💾 Saving..." : "💾 Simpan Layout"}</button>
        </div>

        {/* Palette */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
          {SEAT_TYPES.map(t => (
            <button key={t.key} onClick={() => setActiveType(t.key)} style={{
              padding: "8px 14px", borderRadius: 10,
              background: activeType === t.key ? t.color + "22" : "rgba(255,255,255,0.03)",
              border: activeType === t.key ? `1.5px solid ${t.color}` : "1px solid rgba(255,255,255,0.08)",
              color: activeType === t.key ? t.color : "#e6edf3",
              fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              display: "inline-flex", alignItems: "center", gap: 6,
            }}>
              <span style={{ fontSize: 15 }}>{t.emoji}</span> {t.label}
              {stats.counts[t.key] ? <span style={{ fontFamily: "'Geist Mono',monospace", opacity: 0.7, marginLeft: 4 }}>· {stats.counts[t.key]}</span> : null}
            </button>
          ))}
        </div>

        <div style={{ fontSize: 11, color: "#7d8590", marginBottom: 10 }}>
          💡 Pilih tipe di atas → klik cell di grid bawah untuk paint. Tahan mouse untuk drag-paint banyak cell sekaligus.
        </div>

        {/* SCREEN indicator */}
        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <div style={{ display: "inline-block", padding: "6px 60px", background: "linear-gradient(180deg, rgba(255,255,255,0.06), transparent)", borderTop: "2px solid rgba(255,255,255,0.3)", borderRadius: "100% 100% 0 0 / 30% 30% 0 0", fontSize: 10, letterSpacing: 3, fontFamily: "'Geist Mono',monospace", color: "#7d8590", fontWeight: 800 }}>
            🎬 SCREEN / LAYAR
          </div>
        </div>

        {/* Grid */}
        <div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "center", padding: 16, background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 12, overflowX: "auto" }}
          onMouseDown={() => setPaintMode(true)}
          onMouseUp={() => setPaintMode(false)}
          onMouseLeave={() => setPaintMode(false)}
        >
          {seatMap.map((row, r) => (
            <div key={r} style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <div style={{ width: 20, fontSize: 11, fontFamily: "'Geist Mono',monospace", color: "#7d8590", fontWeight: 800 }}>{ROW_LETTER(r)}</div>
              {row.map((cell, c) => {
                const t = cell && cell.type ? TYPE_BY_KEY[cell.type] : null;
                const isVoid = !cell || cell.type === "void";
                return (
                  <button
                    key={c}
                    onMouseDown={(e) => { e.preventDefault(); paintCell(r, c); }}
                    onMouseEnter={() => { if (paintMode) paintCell(r, c); }}
                    title={cell?.label || `(${r + 1}, ${c + 1})`}
                    style={{
                      width: 32, height: 32, borderRadius: 6,
                      background: isVoid ? "transparent" : (t?.color + "22"),
                      border: isVoid ? "1px dashed rgba(255,255,255,0.1)" : `1px solid ${t?.color}55`,
                      color: t?.color || "#5b6470",
                      fontSize: 9, fontWeight: 800, fontFamily: "'Geist Mono',monospace",
                      cursor: "pointer", padding: 0, lineHeight: 1, userSelect: "none",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "transform 0.08s ease",
                    }}>
                    {isVoid ? "" : (cell.label?.replace(/^[A-Z]+/, "") || "")}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Summary */}
        <div style={{ marginTop: 14, padding: "12px 14px", background: "rgba(168,85,247,0.05)", border: "1px solid rgba(168,85,247,0.15)", borderRadius: 10, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 14, fontSize: 12 }}>
          <span style={{ color: "#c084fc", fontFamily: "'Geist Mono',monospace", letterSpacing: 1, fontWeight: 800 }}>📊 KAPASITAS: {stats.totalSeats} kursi</span>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {SEAT_TYPES.filter(t => t.key !== "void" && stats.counts[t.key]).map(t => (
              <span key={t.key} style={{ color: t.color, fontFamily: "'Geist Mono',monospace" }}>
                {t.emoji} {t.label}: <b>{stats.counts[t.key]}</b>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const inp = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 7, padding: "6px 10px", color: "#fff", fontSize: 13, fontFamily: "'Geist Mono',monospace", width: 60, outline: "none", textAlign: "center", fontWeight: 800 };
const btnPrimary = { background: "linear-gradient(135deg,#10b981,#34d399)", border: "none", borderRadius: 8, padding: "8px 18px", color: "#04130c", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 2px 6px rgba(16,185,129,0.3)" };
const btnSecondary = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "7px 14px", color: "#e6edf3", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
const btnDanger = { background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, padding: "7px 14px", color: "#fca5a5", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
