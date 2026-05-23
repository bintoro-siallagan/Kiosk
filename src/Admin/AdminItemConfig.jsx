// src/Admin/AdminItemConfig.jsx
// Item Config — Inventory Config + Modifier System (CRUD lengkap).

import { useState, useEffect, useCallback } from "react";
import { useUiKit } from "../components/uiKit.jsx";

const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const AC = "#0d9488";
const emptyGroup = { name: "", mod_type: "single", options: [{ name: "", price: 0 }] };

export default function AdminItemConfig({ apiBase = "" }) {
  const { confirm } = useUiKit();
  const [d, setD] = useState(null);
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState(null); // modifier group editing/creating
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    fetch(`${apiBase}/api/item-config`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const patch = (it, changes) => {
    const body = {
      inventory_type: it.inventory_type, min_stock: it.min_stock, reorder_point: it.reorder_point,
      expiry_tracking: it.expiry_tracking, batch_tracking: it.batch_tracking, ...changes,
    };
    fetch(`${apiBase}/api/item-config/inventory/${it.item_code}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(r => r.json()).then(j => { if (j.ok) load(); }).catch(() => {});
  };

  const saveGroup = async () => {
    if (!editing.name?.trim()) { setMsg("⚠ Nama wajib"); return; }
    const isNew = !editing.id;
    const url = isNew ? `${apiBase}/api/item-config/modifiers` : `${apiBase}/api/item-config/modifiers/${editing.id}`;
    const r = await fetch(url, {
      method: isNew ? "POST" : "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing),
    });
    const j = await r.json();
    if (j.ok) { setMsg(isNew ? "✓ Modifier ditambah" : "✓ Modifier disimpan"); setEditing(null); load(); }
    else setMsg(j.error || "gagal");
  };
  const removeGroup = async (g) => {
    const ok = await confirm({ title: `Hapus modifier group "${g.name}"?`, message: `${g.options.length} opsi akan hilang. Tidak bisa dibatalkan.`, danger: true, okLabel: "Hapus" });
    if (!ok) return;
    const r = await fetch(`${apiBase}/api/item-config/modifiers/${g.id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Modifier dihapus"); load(); }
    else setMsg(j.error || "gagal");
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Item Config…</div>;
  const s = d.summary;
  const inv = filter === "all" ? d.inventory : d.inventory.filter(i => i.inventory_type === filter);

  return (
    <div>
      <div style={S.intro}>
        🔧 <b style={{ color: AC }}>ITEM CONFIG</b> — Inventory Config (stock/non-stock, min stock, reorder
        point, expiry &amp; batch tracking) + Modifier System (size/sugar/ice/topping/add-on).
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Stock Item" v={String(s.stock_items)} c={AC} sub="dilacak stoknya" />
        <Kpi label="Non-Stock" v={String(s.non_stock)} c="#5b6470" sub="made to order" />
        <Kpi label="Expiry Tracked" v={String(s.expiry_tracked)} c="#f59e0b" />
        <Kpi label="Modifier Group" v={String(s.modifier_groups)} c="#a855f7" />
      </div>

      {/* Modifier system */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={S.kicker}>➕ MODIFIER SYSTEM</span>
          <button onClick={() => setEditing({ ...emptyGroup, options: [{ name: "", price: 0 }] })} style={{ background: AC, color: "#fff", border: "none", padding: "6px 12px", borderRadius: 7, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ Group Baru</button>
        </div>
        {msg ? <div style={{ fontSize: 12, marginTop: 8, color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 10, marginTop: 10 }}>
          {d.modifiers.map(g => (
            <div key={g.id} style={{ background: "#0a0e16", border: "1px solid #161b22", borderRadius: 9, padding: "11px 13px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>{g.name}</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: "#a855f7", fontFamily: "'Geist Mono',monospace" }}>{g.mod_type.toUpperCase()}</span>
              </div>
              {g.options.map((o, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "2px 0", color: "#9da7b3" }}>
                  <span>{o.name}</span>
                  <span style={{ color: o.price > 0 ? "#10b981" : "#5b6470", fontFamily: "'Geist Mono',monospace" }}>{o.price > 0 ? "+" + fmtRp(o.price) : "gratis"}</span>
                </div>
              ))}
              <div style={{ display: "flex", gap: 4, marginTop: 8, paddingTop: 6, borderTop: "1px solid #161b22" }}>
                <button onClick={() => setEditing({ ...g, options: [...(g.options || [])] })} style={{ background: "#f59e0b18", border: "1px solid #f59e0b44", color: "#f59e0b", padding: "3px 9px", borderRadius: 5, fontSize: 10.5, cursor: "pointer", fontFamily: "inherit", fontWeight: 700, flex: 1 }}>✏️ Edit</button>
                <button onClick={() => removeGroup(g)} style={{ background: "#ef444418", border: "1px solid #ef444444", color: "#ef4444", padding: "3px 9px", borderRadius: 5, fontSize: 10.5, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 12, padding: 22, maxWidth: 540, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 14 }}>{editing.id ? `✏️ Edit Modifier Group` : "+ Group Modifier Baru"}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>NAMA GROUP</div><input value={editing.name || ""} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="Ukuran / Topping / Es / ..." style={inpStyle} /></div>
              <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>TIPE</div>
                <select value={editing.mod_type || "single"} onChange={e => setEditing({ ...editing, mod_type: e.target.value })} style={inpStyle}>
                  <option value="single">Single (pilih 1)</option>
                  <option value="multi">Multi (pilih banyak)</option>
                  <option value="addon">Add-on</option>
                </select>
              </div>
            </div>
            <div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 6 }}>OPSI</div>
            {(editing.options || []).map((o, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 120px auto", gap: 6, marginBottom: 6 }}>
                <input value={o.name} onChange={e => setEditing({ ...editing, options: editing.options.map((op, idx) => idx === i ? { ...op, name: e.target.value } : op) })} placeholder="Nama opsi (Reguler / Large / Boba…)" style={inpStyle} />
                <input type="number" value={o.price || 0} onChange={e => setEditing({ ...editing, options: editing.options.map((op, idx) => idx === i ? { ...op, price: Number(e.target.value) } : op) })} placeholder="+harga" style={inpStyle} />
                <button onClick={() => setEditing({ ...editing, options: editing.options.filter((_, idx) => idx !== i) })} style={{ background: "#ef444418", border: "1px solid #ef444444", color: "#ef4444", padding: "0 10px", borderRadius: 6, cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>×</button>
              </div>
            ))}
            <button onClick={() => setEditing({ ...editing, options: [...(editing.options || []), { name: "", price: 0 }] })} style={{ background: "#161b22", border: "1px dashed #30363d", color: "#9ca3af", padding: "5px 12px", borderRadius: 6, fontSize: 11, cursor: "pointer", fontFamily: "inherit", marginTop: 4 }}>+ Opsi</button>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button onClick={() => setEditing(null)} style={{ background: "#161b22", border: "1px solid #30363d", color: "#9ca3af", padding: "8px 14px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Batal</button>
              <button onClick={saveGroup} style={{ background: AC, color: "#fff", border: "none", padding: "8px 18px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>{editing.id ? "💾 Simpan" : "+ Tambah"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Inventory config */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={S.kicker}>📦 INVENTORY CONFIG</span>
          <div style={{ display: "flex", gap: 5, marginLeft: "auto" }}>
            {["all", "stock", "non-stock"].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{ background: filter === f ? AC : "#0a0e16", border: `1px solid ${filter === f ? AC : "#21262d"}`, color: filter === f ? "#fff" : "#9da7b3", fontSize: 11, padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit" }}>{f}</button>
            ))}
          </div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
          <thead>
            <tr style={{ color: "#5b6470", fontSize: 10, textAlign: "left" }}>
              {["ITEM", "TIPE", "MIN STOCK", "REORDER", "EXPIRY", "BATCH"].map(h => <th key={h} style={{ padding: "6px 8px", fontWeight: 600 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {inv.map(it => (
              <tr key={it.item_code} style={{ borderTop: "1px solid #161b22", fontSize: 12 }}>
                <td style={S.td}>
                  <div style={{ color: "#e6edf3", fontWeight: 600 }}>{it.name}</div>
                  <div style={{ color: "#5b6470", fontSize: 10 }}>{it.item_type}{it.current_stock != null ? ` · stok ${Math.round(it.current_stock * 10) / 10} ${it.uom}` : ""}</div>
                </td>
                <td style={S.td}>
                  <button onClick={() => patch(it, { inventory_type: it.inventory_type === "stock" ? "non-stock" : "stock" })}
                    style={{ ...S.toggle, color: it.inventory_type === "stock" ? AC : "#5b6470", borderColor: it.inventory_type === "stock" ? AC + "55" : "#21262d" }}>
                    {it.inventory_type === "stock" ? "● STOCK" : "○ NON-STOCK"}
                  </button>
                </td>
                <td style={{ ...S.td, fontFamily: "'Geist Mono',monospace", color: "#9da7b3" }}>{it.inventory_type === "stock" ? it.min_stock : "—"}</td>
                <td style={{ ...S.td, fontFamily: "'Geist Mono',monospace", color: "#9da7b3" }}>{it.inventory_type === "stock" ? it.reorder_point : "—"}</td>
                <td style={S.td}>
                  <button onClick={() => patch(it, { expiry_tracking: !it.expiry_tracking })} style={{ ...S.flag, color: it.expiry_tracking ? "#f59e0b" : "#5b6470" }}>{it.expiry_tracking ? "✓ ya" : "—"}</button>
                </td>
                <td style={S.td}>
                  <button onClick={() => patch(it, { batch_tracking: !it.batch_tracking })} style={{ ...S.flag, color: it.batch_tracking ? "#3b82f6" : "#5b6470" }}>{it.batch_tracking ? "✓ ya" : "—"}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 11, color: "#5b6470", marginTop: 8 }}>💡 {d.bom_note}</div>
    </div>
  );
}

function Kpi({ label, v, c, sub }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Geist Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: c, fontFamily: "'Geist Mono',monospace", margin: "4px 0 2px" }}>{v}</div>
      <div style={{ fontSize: 10, color: "#5b6470" }}>{sub || " "}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Geist Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  td: { padding: "7px 8px" },
  toggle: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 6, padding: "4px 9px", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "'Geist Mono',monospace" },
  flag: { background: "transparent", border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
};
const inpStyle = { background: "#0a0e16", border: "1px solid #30363d", borderRadius: 7, padding: "7px 10px", color: "#e6edf3", fontSize: 12.5, fontFamily: "inherit", outline: "none", boxSizing: "border-box", width: "100%" };
