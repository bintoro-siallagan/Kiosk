// src/CommandReorderModal.jsx
// Quick Reorder — dari indikator stok WH/PPIC, sekali klik langsung
// bikin Purchase Request ke modul Procurement. Biar stok ke-order
// sebelum habis (target: gak kehabisan dalam 1 minggu ke depan).

import { useState, useEffect } from "react";

const MONO = "var(--m)";
import { fmtMoney as fmtRp } from "./lib/currency.js";

export default function CommandReorderModal({ item, apiBase = "", onClose, onDone }) {
  const daysLeft = item.dailyUse > 0 ? Math.floor(item.stock / item.dailyUse) : 999;
  const suggested = Math.max(1, Math.round((item.maxStock || item.stock * 2) - item.stock));
  const [qty, setQty] = useState(suggested);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(null);
  const [err, setErr] = useState("");
  const [locked, setLocked] = useState(null);

  useEffect(() => {
    fetch(`${apiBase}/api/price-list/lookup?sku=${encodeURIComponent(item.id)}`)
      .then(r => r.json()).then(setLocked).catch(() => setLocked({ found: false }));
  }, [apiBase, item.id]);

  const priority = daysLeft <= 3 ? "urgent" : daysLeft <= 7 ? "high" : "normal";
  // harga di-LOCK dari price list — kalau belum ada, fallback ke harga estimasi
  const unitPrice = locked && locked.found ? locked.price : (item.costPerUnit || 0);
  const estTotal = qty * unitPrice;

  const submit = () => {
    if (qty <= 0 || saving) return;
    setSaving(true); setErr("");
    fetch(`${apiBase}/api/procurement/pr`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requested_by: "Command Center — WH/PPIC",
        department: "Warehouse",
        priority,
        needed_date: Math.floor(Date.now() / 1000) + 3 * 86400,
        status: "submitted",
        notes: `Quick reorder — stok ${item.name} menipis (sisa ${daysLeft >= 999 ? "?" : daysLeft} hari)`,
        items: [{
          sku: item.id, item_name: item.name, quantity: qty, unit: item.unit,
          estimated_price: unitPrice, notes: "auto-reorder dari indikator WH/PPIC",
        }],
      }),
    })
      .then(r => r.json())
      .then(j => {
        if (j && j.pr_number) { setDone(j); onDone && onDone(item.id, j); }
        else setErr((j && j.error) || "gagal membuat PR");
      })
      .catch(e => setErr(String(e)))
      .finally(() => setSaving(false));
  };

  return (
    <div style={S.root} onClick={onClose}>
      <div style={S.box} onClick={e => e.stopPropagation()}>
        {done ? (
          <div style={{ textAlign: "center", padding: "8px 0" }}>
            <div style={{ fontSize: 46 }}>✅</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", margin: "8px 0 4px" }}>Permintaan Restock Dibuat</div>
            <div style={{ fontSize: 13, color: "#9ca3af" }}>
              PR <b style={{ color: "#22d3ee", fontFamily: MONO }}>{done.pr_number}</b> — {qty} {item.unit} {item.name}
            </div>
            <div style={{ fontSize: 12, color: "#777", marginTop: 6 }}>
              Masuk ke modul Procurement, prioritas{" "}
              <b style={{ color: priority === "urgent" ? "#ef4444" : "#f59e0b" }}>{priority.toUpperCase()}</b>.
            </div>
            <button onClick={onClose} style={S.cta}>Done</button>
          </div>
        ) : (
          <>
            <div style={S.kicker}>📦 QUICK REORDER — WH/PPIC</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", marginTop: 4 }}>{item.name}</div>
            <div style={{ fontSize: 12, color: "#777", fontFamily: MONO }}>{item.id} · {item.category || "bahan"}</div>

            <div style={S.statRow}>
              <Stat label="STOK SKRG" value={`${Math.round(item.stock * 10) / 10} ${item.unit}`} col="#e4e4e7" />
              <Stat label="SISA HARI" value={daysLeft >= 999 ? "—" : daysLeft + " hari"}
                col={daysLeft <= 3 ? "#ef4444" : daysLeft <= 7 ? "#f59e0b" : "#10b981"} />
              <Stat label="MIN / MAX" value={`${item.minStock} / ${item.maxStock}`} col="#9ca3af" />
            </div>

            {daysLeft <= 7 && (
              <div style={S.warn}>⚠ Stok habis dalam {daysLeft} hari — reorder sekarang biar gak kehabisan minggu ini.</div>
            )}

            <label style={S.lbl}>JUMLAH ORDER ({item.unit})</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 5 }}>
              <button onClick={() => setQty(q => Math.max(1, q - 5))} style={S.qbtn}>−</button>
              <input type="number" value={qty}
                onChange={e => setQty(Math.max(0, Number(e.target.value) || 0))} style={S.qinput} />
              <button onClick={() => setQty(q => q + 5)} style={S.qbtn}>+</button>
              <button onClick={() => setQty(suggested)} style={S.suggBtn}>saran {suggested}</button>
            </div>

            <div style={S.priceSrc}>
              {locked === null ? "memuat harga…"
                : locked.found
                  ? <>🔒 Price <b style={{ color: "#10b981" }}>locked</b> dari Price List — {fmtRp(unitPrice)}/{item.unit} · {locked.supplier || "vendor"}</>
                  : <span style={{ color: "#fcd34d" }}>⚠ Item belum ada di Price List — pakai harga estimasi {fmtRp(unitPrice)}</span>}
            </div>
            <div style={S.estRow}>
              <span style={{ color: "#9ca3af", fontSize: 13 }}>Estimasi biaya</span>
              <span style={{ fontSize: 18, fontWeight: 800, color: "#10b981", fontFamily: MONO }}>{fmtRp(estTotal)}</span>
            </div>

            {err && <div style={{ color: "#f87171", fontSize: 12, marginTop: 8 }}>{err}</div>}
            <button onClick={submit} disabled={saving || qty <= 0} style={{ ...S.cta, opacity: saving || qty <= 0 ? 0.55 : 1 }}>
              {saving ? "Memproses…" : "🛒 Buat Permintaan Restock"}
            </button>
            <button onClick={onClose} style={S.cancel}>Cancel</button>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, col }) {
  return (
    <div style={{ flex: 1, textAlign: "center" }}>
      <div style={{ fontSize: 9, color: "#666", fontFamily: MONO, letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: col, fontFamily: MONO, marginTop: 3 }}>{value}</div>
    </div>
  );
}

const S = {
  root: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000, fontFamily: "var(--s),system-ui,sans-serif", padding: 20 },
  box: { background: "#0d1117", border: "1px solid #21262d", borderRadius: 16, padding: "22px 24px", width: "min(420px,96vw)" },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "#f59e0b", fontFamily: MONO },
  statRow: { display: "flex", gap: 8, marginTop: 14, background: "#080a0f", border: "1px solid #21262d", borderRadius: 10, padding: "10px 6px" },
  warn: { marginTop: 12, background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.4)", borderRadius: 8, padding: "8px 11px", fontSize: 12, color: "#fcd34d", lineHeight: 1.45 },
  lbl: { display: "block", fontSize: 10, color: "#888", fontFamily: MONO, letterSpacing: 1, marginTop: 14 },
  qbtn: { width: 38, height: 38, background: "#161b22", border: "1px solid #2d333b", color: "#e4e4e7", fontSize: 18, fontWeight: 700, borderRadius: 8, cursor: "pointer", flexShrink: 0 },
  qinput: { flex: 1, background: "#080a0f", border: "1px solid #2d333b", borderRadius: 8, padding: "9px 12px", color: "#fff", fontSize: 16, fontWeight: 700, fontFamily: MONO, textAlign: "center", outline: "none", minWidth: 0 },
  suggBtn: { background: "#22d3ee1f", border: "1px solid #22d3ee55", color: "#22d3ee", fontSize: 11, fontWeight: 700, padding: "9px 10px", borderRadius: 8, cursor: "pointer", fontFamily: MONO, flexShrink: 0 },
  priceSrc: { marginTop: 12, fontSize: 11, color: "#9ca3af", lineHeight: 1.5 },
  estRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, padding: "10px 12px", background: "#080a0f", border: "1px solid #21262d", borderRadius: 10 },
  cta: { width: "100%", marginTop: 14, padding: "13px", background: "#f59e0b", color: "#1a1006", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" },
  cancel: { width: "100%", marginTop: 8, padding: "9px", background: "transparent", color: "#777", border: "none", fontSize: 12, cursor: "pointer", fontFamily: "inherit" },
};
