/**
 * AdminChecklist.jsx — kelola item daily checklist opening/closing store.
 * Tab di AdminTools. Endpoint: /api/checklist
 *
 * Features:
 *   - Per-item vertical tag (F&B / Cinema / Universal) — apa yg tampil di POS mana
 *   - Edit label + vertical
 *   - Add item dgn vertical selector
 *   - Filter view by vertical
 *
 * Props: apiBase — HOST backend.
 */
import { useState, useEffect, useCallback } from "react";

const VERTICAL_META = {
  fnb: { label: "F&B", icon: "🍦", color: "#10B981" },
  cinema: { label: "Cinema", icon: "🎬", color: "#A855F7" },
  null: { label: "Universal", icon: "🌐", color: "#9CA3AF" },
};
const VERTICAL_KEY = (v) => v || "null";

const S = {
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 14, padding: 18, marginBottom: 16 },
  label: { fontSize: 11, color: "#555", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10, fontFamily: "'Geist Mono',monospace" },
  input: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 8, padding: "9px 11px", color: "#fff", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" },
  select: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 8, padding: "9px 11px", color: "#fff", fontSize: 13, fontFamily: "inherit", cursor: "pointer" },
  btn: (c = "#34D399") => ({ background: c + "18", border: `1px solid ${c}44`, borderRadius: 8, padding: "7px 12px", color: c, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }),
  row: { display: "flex", alignItems: "center", gap: 8, padding: "10px 0", borderBottom: "1px solid #0f1629" },
  vBadge: (v) => {
    const m = VERTICAL_META[VERTICAL_KEY(v)];
    return {
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 8px", borderRadius: 6,
      background: m.color + "1a", border: `1px solid ${m.color}55`,
      color: m.color, fontSize: 10, fontWeight: 700,
      letterSpacing: 0.5, fontFamily: "'Geist Mono',monospace",
      cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap",
    };
  },
};

function VerticalSelect({ value, onChange, style }) {
  return (
    <select value={value || ""} onChange={e => onChange(e.target.value || null)} style={{ ...S.select, ...style }}>
      <option value="">🌐 Universal (tampil di semua)</option>
      <option value="fnb">🍦 F&B (hanya POS F&B)</option>
      <option value="cinema">🎬 Cinema (hanya POS Cinema)</option>
    </select>
  );
}

function Section({ apiBase, type, title, accent }) {
  const [items, setItems] = useState([]);
  const [newLabel, setNewLabel] = useState("");
  const [newVertical, setNewVertical] = useState(null);
  const [editId, setEditId] = useState(null);
  const [editLabel, setEditLabel] = useState("");
  const [editVertical, setEditVertical] = useState(null);
  const [filterVertical, setFilterVertical] = useState("all"); // 'all' | 'fnb' | 'cinema' | 'universal'

  const load = useCallback(async () => {
    // Backend filter exclude items dgn vertical lain — utk admin, kita load all tanpa filter.
    try { setItems(await fetch(`${apiBase}/api/checklist/items?type=${type}`).then(r => r.json())); } catch {}
  }, [apiBase, type]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!newLabel.trim()) return;
    await fetch(`${apiBase}/api/checklist/items`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, label: newLabel.trim(), vertical: newVertical }),
    });
    setNewLabel(""); setNewVertical(null); load();
  };
  const saveEdit = async (id) => {
    if (!editLabel.trim()) return;
    await fetch(`${apiBase}/api/checklist/items/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: editLabel.trim(), vertical: editVertical }),
    });
    setEditId(null); load();
  };
  const quickChangeVertical = async (id, vertical) => {
    await fetch(`${apiBase}/api/checklist/items/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vertical }),
    });
    load();
  };
  const del = async (id) => {
    if (!window.confirm("Hapus item checklist ini?")) return;
    await fetch(`${apiBase}/api/checklist/items/${id}`, { method: "DELETE" });
    load();
  };

  // Filter + group
  const filtered = items.filter(it => {
    if (filterVertical === "all") return true;
    if (filterVertical === "universal") return !it.vertical;
    return it.vertical === filterVertical;
  });
  const counts = items.reduce((acc, it) => {
    const k = VERTICAL_KEY(it.vertical);
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  return (
    <div style={{ ...S.card, borderLeft: `4px solid ${accent}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
        <div style={S.label}>{title} ({items.length} item)</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[
            { k: "all",       label: "Semua", n: items.length },
            { k: "fnb",       label: "🍦 F&B",      n: counts.fnb || 0 },
            { k: "cinema",    label: "🎬 Cinema",   n: counts.cinema || 0 },
            { k: "universal", label: "🌐 Universal", n: counts.null || 0 },
          ].map(t => (
            <button key={t.k} onClick={() => setFilterVertical(t.k)} style={{
              background: filterVertical === t.k ? "rgba(245,158,11,0.18)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${filterVertical === t.k ? "#F59E0B" : "#222"}`,
              color: filterVertical === t.k ? "#F59E0B" : "#888",
              borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer",
              fontFamily: "inherit",
            }}>{t.label} ({t.n})</button>
          ))}
        </div>
      </div>

      {filtered.length === 0 && (
        <div style={{ color: "#555", padding: 12, fontSize: 13, textAlign: "center" }}>
          Tidak ada item di filter ini
        </div>
      )}

      {filtered.map(it => (
        <div key={it.id} style={S.row}>
          {editId === it.id ? (
            <>
              <input value={editLabel} onChange={e => setEditLabel(e.target.value)}
                onKeyDown={e => e.key === "Enter" && saveEdit(it.id)} style={{ ...S.input, flex: 1 }} autoFocus />
              <VerticalSelect value={editVertical} onChange={setEditVertical} style={{ minWidth: 180 }} />
              <button onClick={() => saveEdit(it.id)} style={S.btn("#34D399")}>💾 Simpan</button>
              <button onClick={() => setEditId(null)} style={S.btn("#555")}>Cancel</button>
            </>
          ) : (
            <>
              <span style={{ flex: 1, fontSize: 14 }}>{it.label}</span>
              <select
                value={it.vertical || ""}
                onChange={e => quickChangeVertical(it.id, e.target.value || null)}
                title="Klik untuk ganti vertical"
                style={S.vBadge(it.vertical)}>
                <option value="" style={{ background: "#0a0e16", color: "#fff" }}>🌐 Universal</option>
                <option value="fnb" style={{ background: "#0a0e16", color: "#fff" }}>🍦 F&B</option>
                <option value="cinema" style={{ background: "#0a0e16", color: "#fff" }}>🎬 Cinema</option>
              </select>
              <button onClick={() => { setEditId(it.id); setEditLabel(it.label); setEditVertical(it.vertical); }} style={S.btn("#3B82F6")}>✏️ Edit</button>
              <button onClick={() => del(it.id)} style={S.btn("#F87171")}>🗑 Hapus</button>
            </>
          )}
        </div>
      ))}

      <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "stretch", flexWrap: "wrap" }}>
        <input value={newLabel} onChange={e => setNewLabel(e.target.value)} onKeyDown={e => e.key === "Enter" && add()}
          placeholder="Item checklist baru..." style={{ ...S.input, flex: 1, minWidth: 200 }} />
        <VerticalSelect value={newVertical} onChange={setNewVertical} style={{ minWidth: 200 }} />
        <button onClick={add} style={{ ...S.btn(accent), padding: "9px 16px", fontSize: 13 }}>+ Tambah</button>
      </div>
    </div>
  );
}

export default function AdminChecklist({ apiBase = "" }) {
  const [subs, setSubs] = useState([]);

  useEffect(() => {
    fetch(`${apiBase}/api/checklist/submissions?limit=20`)
      .then(r => r.json()).then(d => setSubs(Array.isArray(d) ? d : [])).catch(() => {});
  }, [apiBase]);

  return (
    <div>
      <div style={{ ...S.card, background: "#0a1422", border: "1px solid #15324d" }}>
        <div style={{ ...S.label, color: "#5fa8d3" }}>✅ Daily Checklist — Open & Close Toko</div>
        <div style={{ fontSize: 13, color: "#8b949e", lineHeight: 1.6 }}>
          Item di sini <b>wajib di-ceklis kasir</b> sebelum mulai shift (opening) & sebelum tutup shift (closing).
          Tiap item bisa diset vertical: <span style={{ color: VERTICAL_META.fnb.color }}>🍦 F&B</span> (hanya tampil di POS F&B),
          {" "}<span style={{ color: VERTICAL_META.cinema.color }}>🎬 Cinema</span> (hanya POS Cinema), atau
          {" "}<span style={{ color: VERTICAL_META.null.color }}>🌐 Universal</span> (tampil di semua POS).
        </div>
      </div>

      <Section apiBase={apiBase} type="opening" title="🌅 Checklist Open Toko" accent="#10B981" />
      <Section apiBase={apiBase} type="closing" title="🌙 Checklist Close Toko" accent="#F59E0B" />

      <div style={S.card}>
        <div style={S.label}>Riwayat Checklist ({subs.length})</div>
        {subs.length === 0 ? (
          <div style={{ color: "#555", padding: 8, fontSize: 13 }}>No checklist disubmit</div>
        ) : subs.map(s => (
          <div key={s.id} style={S.row}>
            <span style={{ ...S.btn(s.type === "opening" ? "#10B981" : "#F59E0B"), padding: "3px 9px", fontSize: 11, cursor: "default" }}>
              {s.type === "opening" ? "🌅 opening" : "🌙 closing"}
            </span>
            <span style={{ flex: 1, fontSize: 13 }}>
              {s.staff_name || "—"} · {(s.items || []).length} item{s.notes ? ` · 📝 ${s.notes}` : ""}
            </span>
            <span style={{ fontSize: 11, color: "#555" }}>{new Date((s.created_at || 0) * 1000).toLocaleString("id-ID")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
