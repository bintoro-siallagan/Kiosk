// karyaOS — F&B Dietary / Allergen Tags per menu item
import { useState, useEffect, useCallback } from "react";
import { useUiKit, EmptyState, TooltipButton, Help } from "../components/uiKit.jsx";
const C = { card: "#0d1117", border: "#1b212c", sub: "#9ca3af", dim: "#5b6470" };
const STANDARD_TAGS = [
  { id: "halal",         label: "Halal",         icon: "🕌", color: "#10b981" },
  { id: "vegan",         label: "Vegan",         icon: "🌱", color: "#16a34a" },
  { id: "vegetarian",    label: "Vegetarian",    icon: "🥗", color: "#22c55e" },
  { id: "gluten_free",   label: "Gluten-Free",   icon: "🌾", color: "#f59e0b" },
  { id: "dairy_free",    label: "Dairy-Free",    icon: "🥛", color: "#3b82f6" },
  { id: "nut_free",      label: "Nut-Free",      icon: "🥜", color: "#a855f7" },
  { id: "egg_free",      label: "Egg-Free",      icon: "🥚", color: "#ec4899" },
  { id: "soy_free",      label: "Soy-Free",      icon: "🫘", color: "#06b6d4" },
  { id: "spicy_mild",    label: "Pedas Sedang",  icon: "🌶️", color: "#fb923c" },
  { id: "spicy_hot",     label: "Pedas Banget",  icon: "🔥", color: "#ef4444" },
  { id: "contains_pork", label: "Mengandung Babi", icon: "🐖", color: "#dc2626" },
  { id: "contains_alcohol", label: "Mengandung Alkohol", icon: "🍷", color: "#991b1b" },
  { id: "kids_friendly", label: "Kids-Friendly", icon: "🧒", color: "#fbbf24" },
  { id: "signature",     label: "Signature",     icon: "⭐", color: "#fbbf24" },
  { id: "new",           label: "New",           icon: "✨", color: "#ec4899" },
];

export default function FnbDietaryTags({ apiBase = "" }) {
  const base = (apiBase || "") + "/api/fnb";
  const [menuItemId, setMenuItemId] = useState("");
  const [menuItemName, setMenuItemName] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [allTags, setAllTags] = useState([]);
  const [toast, setToast] = useState(null);
  const showToast = (m, k = "ok") => { setToast({ m, k }); setTimeout(() => setToast(null), 2200); };
  const load = useCallback(async () => {
    const d = await fetch(`${base}/dietary-tags`).then(r => r.json()); setAllTags(d.tags || []);
  }, [base]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!menuItemId) { setSelected(new Set()); return; }
    fetch(`${base}/dietary-tags?menu_item_id=${menuItemId}`).then(r => r.json()).then(d => {
      setSelected(new Set((d.tags || []).map(t => t.tag)));
    });
  }, [base, menuItemId]);
  const toggle = (tag) => setSelected(p => { const n = new Set(p); n.has(tag) ? n.delete(tag) : n.add(tag); return n; });
  const save = async () => {
    if (!menuItemId) { showToast("Masukkan Menu Item ID", "err"); return; }
    const r = await fetch(`${base}/dietary-tags/bulk`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ menu_item_id: parseInt(menuItemId, 10), menu_item_name: menuItemName, tags: [...selected] }) });
    const d = await r.json(); if (!d.ok) { showToast(d.error, "err"); return; }
    showToast(`${d.count} tag tersimpan`); load();
  };
  // Group tags by menu_item_id for browsing
  const grouped = {};
  for (const t of allTags) {
    const k = t.menu_item_id;
    (grouped[k] = grouped[k] || { id: k, name: t.menu_item_name, tags: [] }).tags.push(t.tag);
  }
  return (
    <div style={{ fontFamily: "'Inter',sans-serif", color: "#e6edf3" }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 19, fontWeight: 700, letterSpacing: 1 }}>🌱 Dietary / Allergen Tags</div>
        <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>Tandai menu dengan info allergen / halal / vegan untuk customer dengan diet preference.</div>
      </div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: C.dim, letterSpacing: 1, fontFamily: "'Geist Mono',monospace", marginBottom: 8 }}>ASSIGN TAGS KE MENU ITEM</div>
        <div style={{ display: "grid", gridTemplateColumns: "120px 1fr auto", gap: 8, marginBottom: 12 }}>
          <input type="number" value={menuItemId} onChange={e => setMenuItemId(e.target.value)} placeholder="Menu ID" style={inp} />
          <input value={menuItemName} onChange={e => setMenuItemName(e.target.value)} placeholder="Nama item (untuk display)" style={inp} />
          <button onClick={save} disabled={!menuItemId} style={{ ...B.save, opacity: menuItemId ? 1 : 0.5 }}>💾 Simpan ({selected.size})</button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {STANDARD_TAGS.map(t => {
            const on = selected.has(t.id);
            return (
              <button key={t.id} onClick={() => toggle(t.id)} disabled={!menuItemId} style={{
                background: on ? t.color + "22" : "transparent", border: `1px solid ${on ? t.color + "88" : "#2a2b30"}`, color: on ? t.color : "#9ca3af",
                padding: "7px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: menuItemId ? "pointer" : "not-allowed", fontFamily: "inherit",
              }}>{t.icon} {t.label}</button>
            );
          })}
        </div>
      </div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "flex", padding: "8px 14px", borderBottom: `1px solid ${C.border}`, color: C.dim, fontSize: 11, letterSpacing: 1 }}>
          <span style={{ width: 80 }}>ITEM ID</span>
          <span style={{ flex: 1 }}>NAMA</span>
          <span style={{ flex: 2 }}>TAGS</span>
        </div>
        {Object.values(grouped).length === 0 ? <Empty>Belum ada item yang di-tag.</Empty> :
          Object.values(grouped).map(g => (
            <div key={g.id} style={{ display: "flex", padding: "10px 14px", borderBottom: `1px solid ${C.border}`, alignItems: "center" }}>
              <span style={{ width: 80, fontFamily: "'Geist Mono',monospace", color: C.dim, fontSize: 12 }}>#{g.id}</span>
              <span style={{ flex: 1, fontWeight: 700, fontSize: 13 }}>{g.name || "—"}</span>
              <span style={{ flex: 2, display: "flex", flexWrap: "wrap", gap: 4 }}>
                {g.tags.map(t => {
                  const tag = STANDARD_TAGS.find(x => x.id === t) || { label: t, icon: "🏷️", color: "#6b7280" };
                  return <span key={t} style={{ background: tag.color + "22", color: tag.color, padding: "2px 7px", borderRadius: 5, fontSize: 11, fontWeight: 700 }}>{tag.icon} {tag.label}</span>;
                })}
              </span>
              <button onClick={() => { setMenuItemId(String(g.id)); setMenuItemName(g.name || ""); }} style={Ba("#a855f7")}>Edit</button>
            </div>
          ))
        }
      </div>
      {toast && <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: toast.k === "err" ? "#7f1d1d" : "#14532d", border: `1px solid ${toast.k === "err" ? "#ef4444" : "#22c55e"}`, color: "#fff", padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 9999 }}>{toast.m}</div>}
    </div>
  );
}
function Empty({ children }) { return <div style={{ padding: "30px 18px", textAlign: "center", color: C.sub, fontSize: 13 }}>{children}</div>; }
const inp = { padding: "9px 12px", background: "#0a0e16", border: `1px solid ${C.border}`, borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" };
const B = { save: { background: "#10b981", border: "none", color: "#04130c", padding: "9px 20px", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" } };
const Ba = (color) => ({ background: color + "18", border: `1px solid ${color}44`, color, padding: "4px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });
