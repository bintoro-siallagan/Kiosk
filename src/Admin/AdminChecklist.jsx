/**
 * AdminChecklist.jsx — kelola item daily checklist opening/closing store.
 * Tab di AdminTools. Endpoint: /api/checklist
 *
 * Props: apiBase — HOST backend.
 */
import { useState, useEffect, useCallback } from "react";

const S = {
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 14, padding: 18, marginBottom: 16 },
  label: { fontSize: 11, color: "#555", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10, fontFamily: "'Space Mono',monospace" },
  input: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 8, padding: "9px 11px", color: "#fff", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" },
  btn: (c = "#34D399") => ({ background: c + "18", border: `1px solid ${c}44`, borderRadius: 8, padding: "7px 12px", color: c, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }),
  row: { display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid #0f1629" },
};

function Section({ apiBase, type, title, accent }) {
  const [items, setItems] = useState([]);
  const [newLabel, setNewLabel] = useState("");
  const [editId, setEditId] = useState(null);
  const [editLabel, setEditLabel] = useState("");

  const load = useCallback(async () => {
    try { setItems(await fetch(`${apiBase}/api/checklist/items?type=${type}`).then(r => r.json())); } catch {}
  }, [apiBase, type]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!newLabel.trim()) return;
    await fetch(`${apiBase}/api/checklist/items`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, label: newLabel.trim() }),
    });
    setNewLabel(""); load();
  };
  const saveEdit = async (id) => {
    if (!editLabel.trim()) return;
    await fetch(`${apiBase}/api/checklist/items/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: editLabel.trim() }),
    });
    setEditId(null); load();
  };
  const del = async (id) => {
    if (!window.confirm("Hapus item checklist ini?")) return;
    await fetch(`${apiBase}/api/checklist/items/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div style={{ ...S.card, borderLeft: `4px solid ${accent}` }}>
      <div style={S.label}>{title} ({items.length} item)</div>
      {items.map(it => (
        <div key={it.id} style={S.row}>
          {editId === it.id ? (
            <>
              <input value={editLabel} onChange={e => setEditLabel(e.target.value)}
                onKeyDown={e => e.key === "Enter" && saveEdit(it.id)} style={{ ...S.input, flex: 1 }} autoFocus />
              <button onClick={() => saveEdit(it.id)} style={S.btn("#34D399")}>💾 Simpan</button>
              <button onClick={() => setEditId(null)} style={S.btn("#555")}>Batal</button>
            </>
          ) : (
            <>
              <span style={{ flex: 1, fontSize: 14 }}>{it.label}</span>
              <button onClick={() => { setEditId(it.id); setEditLabel(it.label); }} style={S.btn("#3B82F6")}>✏️ Edit</button>
              <button onClick={() => del(it.id)} style={S.btn("#F87171")}>🗑 Hapus</button>
            </>
          )}
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input value={newLabel} onChange={e => setNewLabel(e.target.value)} onKeyDown={e => e.key === "Enter" && add()}
          placeholder="Item checklist baru..." style={{ ...S.input, flex: 1 }} />
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
        <div style={{ ...S.label, color: "#5fa8d3" }}>✅ Daily Checklist — Buka & Tutup Toko</div>
        <div style={{ fontSize: 13, color: "#8b949e", lineHeight: 1.5 }}>
          Item di sini <b>wajib di-ceklis kasir</b> sebelum mulai shift (opening) & sebelum tutup shift (closing).
          Kasir gak bisa transaksi kalau opening checklist belum kelar.
        </div>
      </div>

      <Section apiBase={apiBase} type="opening" title="🌅 Checklist Buka Toko" accent="#10B981" />
      <Section apiBase={apiBase} type="closing" title="🌙 Checklist Tutup Toko" accent="#F59E0B" />

      <div style={S.card}>
        <div style={S.label}>Riwayat Checklist ({subs.length})</div>
        {subs.length === 0 ? (
          <div style={{ color: "#555", padding: 8, fontSize: 13 }}>Belum ada checklist disubmit</div>
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
