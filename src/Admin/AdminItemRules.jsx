// src/Admin/AdminItemRules.jsx
// Item Rules — kitchen routing, promo link, availability + combo CRUD.

import { useState, useEffect, useCallback } from "react";
import { useUiKit } from "../components/uiKit.jsx";

const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const AC = "#ea580c";
const STATION_C = { Bar: "#3b82f6", Kitchen: "#f59e0b", Dessert: "#ec4899", "Cinema Snack": "#a855f7" };
const COMBO_ICON = { cinema: "🎬", meal: "🍱", family: "👨‍👩‍👧" };
const emptyCombo = { name: "", combo_type: "meal", items: "", price: 0 };

export default function AdminItemRules({ apiBase = "" }) {
  const { confirm } = useUiKit();
  const [d, setD] = useState(null);
  const [editing, setEditing] = useState(null); // combo editing
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    fetch(`${apiBase}/api/item-rules`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const patch = (it, changes) => {
    const body = {
      kitchen_station: it.kitchen_station, promo_eligible: it.promo_eligible,
      loyalty_eligible: it.loyalty_eligible, cashback_eligible: it.cashback_eligible,
      availability_mode: it.availability_mode, auto_hide_soldout: it.auto_hide_soldout, ...changes,
    };
    fetch(`${apiBase}/api/item-rules/${it.item_code}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(r => r.json()).then(j => { if (j.ok) load(); }).catch(() => {});
  };
  const saveCombo = async () => {
    if (!editing.name?.trim()) { setMsg("⚠ Nama wajib"); return; }
    const isNew = !editing.id;
    const url = isNew ? `${apiBase}/api/item-rules/combos` : `${apiBase}/api/item-rules/combos/${editing.id}`;
    const r = await fetch(url, { method: isNew ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing) });
    const j = await r.json();
    if (j.ok) { setMsg(isNew ? "✓ Combo ditambah" : "✓ Combo disimpan"); setEditing(null); load(); }
    else setMsg(j.error || "gagal");
  };
  const removeCombo = async (c) => {
    const ok = await confirm({ title: `Hapus combo "${c.name}"?`, message: "Combo akan dihapus permanen. Tidak bisa dibatalkan.", danger: true, okLabel: "Delete" });
    if (!ok) return;
    const r = await fetch(`${apiBase}/api/item-rules/combos/${c.id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Combo dihapus"); load(); }
    else setMsg(j.error || "gagal");
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Item Rules…</div>;
  const s = d.summary;
  const cycle = (arr, cur) => arr[(arr.indexOf(cur) + 1) % arr.length];
  const maxSt = Math.max(1, ...d.station_dist.map(x => x.count));

  return (
    <div>
      <div style={S.intro}>
        🍽️ <b style={{ color: AC }}>ITEM RULES</b> — kitchen routing (KDS station), promo engine link,
        availability rule &amp; combo/bundle. Klik badge buat ubah.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Item" v={String(s.total)} c={AC} />
        <Kpi label="Promo Eligible" v={String(s.promo_eligible)} c="#10b981" />
        <Kpi label="Cashback Eligible" v={String(s.cashback_eligible)} c="#fbbf24" />
        <Kpi label="Combo / Bundle" v={String(s.combos)} c="#a855f7" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: 14, marginTop: 14, alignItems: "start" }}>
        {/* Kitchen routing */}
        <div style={S.card}>
          <div style={S.kicker}>🍳 KITCHEN ROUTING (KDS)</div>
          {d.station_dist.map(x => (
            <div key={x.station} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0" }}>
              <span style={{ width: 100, fontSize: 12, color: STATION_C[x.station] }}>{x.station}</span>
              <div style={{ flex: 1, height: 12, background: "#0a0e16", borderRadius: 6, overflow: "hidden" }}>
                <div style={{ height: "100%", width: Math.round(x.count / maxSt * 100) + "%", background: STATION_C[x.station] }} />
              </div>
              <span style={{ width: 26, textAlign: "right", fontFamily: "'Geist Mono',monospace", fontSize: 12, color: "#cdd5df" }}>{x.count}</span>
            </div>
          ))}
        </div>
        {/* Combos */}
        <div style={S.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={S.kicker}>🍱 COMBO & BUNDLE — {d.combos.length}</span>
            <button onClick={() => setEditing({ ...emptyCombo })} style={{ background: AC, color: "#fff", border: "none", padding: "5px 11px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ Combo</button>
          </div>
          {msg ? <div style={{ fontSize: 11, marginTop: 6, color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {d.combos.map(c => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 11, background: "#0a0e16", border: "1px solid #161b22", borderRadius: 9, padding: "10px 12px" }}>
                <span style={{ fontSize: 20 }}>{COMBO_ICON[c.combo_type] || "🍱"}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: "#5b6470" }}>{c.items.join(" + ")}</div>
                </div>
                <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 13, fontWeight: 700, color: "#10b981" }}>{fmtRp(c.price)}</span>
                <span style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => setEditing({ ...c, items: Array.isArray(c.items) ? c.items.join(", ") : (c.items || "") })} title="Edit" style={{ background: "#f59e0b18", border: "1px solid #f59e0b44", color: "#f59e0b", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>✏️</button>
                  <button onClick={() => removeCombo(c)} title="Delete" style={{ background: "#ef444418", border: "1px solid #ef444444", color: "#ef4444", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>🗑️</button>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 12, padding: 22, maxWidth: 500, width: "100%" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 14 }}>{editing.id ? `✏️ Edit Combo` : "+ Combo Baru"}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ gridColumn: "1/-1" }}><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>NAMA COMBO</div><input value={editing.name || ""} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="Cinema Combo XL / Family Meal" style={inpR} /></div>
              <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>TIPE</div>
                <select value={editing.combo_type || "meal"} onChange={e => setEditing({ ...editing, combo_type: e.target.value })} style={inpR}>
                  <option value="meal">🍱 Meal</option><option value="cinema">🎬 Cinema</option><option value="family">👨‍👩‍👧 Family</option>
                </select>
              </div>
              <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>HARGA</div><input type="number" value={editing.price || 0} onChange={e => setEditing({ ...editing, price: Number(e.target.value) })} style={inpR} /></div>
              <div style={{ gridColumn: "1/-1" }}><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>ITEMS (pisah with koma)</div>
                <input value={editing.items || ""} onChange={e => setEditing({ ...editing, items: e.target.value })} placeholder="Popcorn Large, Cola Reguler, Tiket Reguler" style={inpR} /></div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button onClick={() => setEditing(null)} style={{ background: "#161b22", border: "1px solid #30363d", color: "#9ca3af", padding: "8px 14px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Cancel</button>
              <button onClick={saveCombo} style={{ background: AC, color: "#fff", border: "none", padding: "8px 18px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>{editing.id ? "💾 Simpan" : "+ Tambah"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Per-item rules */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>📋 RULE PER ITEM — klik badge buat ubah</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
          <thead>
            <tr style={{ color: "#5b6470", fontSize: 10, textAlign: "left" }}>
              {["ITEM", "KDS STATION", "PROMO", "LOYALTY", "CASHBACK", "AVAILABILITY"].map(h => <th key={h} style={{ padding: "6px 8px", fontWeight: 600 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {d.items.map(it => (
              <tr key={it.item_code} style={{ borderTop: "1px solid #161b22", fontSize: 12 }}>
                <td style={S.td}>
                  <div style={{ color: "#e6edf3", fontWeight: 600 }}>{it.name}</div>
                  <div style={{ color: "#5b6470", fontSize: 10 }}>{it.category}</div>
                </td>
                <td style={S.td}>
                  <button onClick={() => patch(it, { kitchen_station: cycle(d.catalog.stations, it.kitchen_station) })}
                    style={{ ...S.badge, color: STATION_C[it.kitchen_station] || "#9ca3af", borderColor: (STATION_C[it.kitchen_station] || "#9ca3af") + "66" }}>
                    {it.kitchen_station}
                  </button>
                </td>
                {["promo_eligible", "loyalty_eligible", "cashback_eligible"].map(f => (
                  <td key={f} style={S.td}>
                    <button onClick={() => patch(it, { [f]: !it[f] })} style={{ ...S.flag, color: it[f] ? "#10b981" : "#5b6470" }}>
                      {it[f] ? "✓ ya" : "○ no"}
                    </button>
                  </td>
                ))}
                <td style={S.td}>
                  <button onClick={() => patch(it, { availability_mode: cycle(d.catalog.availability_modes, it.availability_mode) })}
                    style={{ ...S.badge, color: it.availability_mode === "Always" ? "#10b981" : "#f59e0b", borderColor: (it.availability_mode === "Always" ? "#10b981" : "#f59e0b") + "66" }}>
                    {it.availability_mode}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, v, c }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Geist Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: c, fontFamily: "'Geist Mono',monospace", marginTop: 4 }}>{v}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Geist Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  td: { padding: "7px 8px" },
  badge: { background: "#0a0e16", border: "1px solid", borderRadius: 6, padding: "4px 9px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "'Geist Mono',monospace" },
  flag: { background: "transparent", border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "'Geist Mono',monospace" },
};
const inpR = { background: "#0a0e16", border: "1px solid #30363d", borderRadius: 7, padding: "7px 10px", color: "#e6edf3", fontSize: 12.5, fontFamily: "inherit", outline: "none", boxSizing: "border-box", width: "100%" };
