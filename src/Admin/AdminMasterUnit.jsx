// src/Admin/AdminMasterUnit.jsx
// Master Unit — master satuan / unit of measure inventory (CRUD lengkap).

import { useState, useEffect, useCallback } from "react";
import { useUiKit } from "../components/uiKit.jsx";

const AC = "#0e7490";
const CAT_C = { Berat: "#f59e0b", Volume: "#3b82f6", Jumlah: "#10b981" };

export default function AdminMasterUnit({ apiBase = "" }) {
  const { confirm } = useUiKit();
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ code: "", name: "", symbol: "", category: "Jumlah", conversion: "1" });
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/master-unit`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const add = () => {
    if (!form.code.trim() || !form.name.trim()) { setMsg("⚠ Kode & nama satuan wajib"); return; }
    fetch(`${apiBase}/api/master-unit`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, conversion: Number(form.conversion) || 1 }),
    }).then(r => r.json()).then(j => {
      if (j.ok) { setMsg("✓ Satuan ditambah"); setForm({ ...form, code: "", name: "", symbol: "" }); load(); }
      else setMsg(j.error || "gagal");
    }).catch(e => setMsg(String(e)));
  };
  const toggle = (u) => {
    fetch(`${apiBase}/api/master-unit/${u.id}/toggle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      .then(r => r.json()).then(j => { if (j.ok) load(); }).catch(() => {});
  };
  const saveEdit = async () => {
    const r = await fetch(`${apiBase}/api/master-unit/${editing.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing),
    });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Satuan disimpan"); setEditing(null); load(); }
    else setMsg(j.error || "gagal");
  };
  const remove = async (u) => {
    const ok = await confirm({ title: `Hapus satuan "${u.name}" (${u.code})?`, message: `Satuan akan dihapus permanen. Item yang masih pakai satuan ini mungkin error — pastikan tidak ada referensi.`, danger: true, okLabel: "Hapus" });
    if (!ok) return;
    const r = await fetch(`${apiBase}/api/master-unit/${u.id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Satuan dihapus"); load(); }
    else setMsg(j.error || "gagal");
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Master Unit…</div>;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        📐 <b style={{ color: "#22d3ee" }}>MASTER UNIT</b> — master satuan (unit of measure) untuk inventory:
        berat, volume &amp; jumlah, lengkap dengan konversi ke satuan dasar.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Satuan" v={String(s.total)} c={AC} />
        <Kpi label="Aktif" v={String(s.active)} c="#10b981" />
        <Kpi label="Kategori" v={String(s.by_category.length)} c="#a855f7" />
        <Kpi label="Nonaktif" v={String(s.total - s.active)} c={s.total - s.active > 0 ? "#f59e0b" : "#5b6470"} />
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>➕ TAMBAH SATUAN</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr 1fr 1.1fr 1.2fr auto", gap: 8, marginTop: 10 }}>
          <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="Kode" style={S.input} />
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nama satuan" style={S.input} />
          <input value={form.symbol} onChange={e => setForm({ ...form, symbol: e.target.value })} placeholder="Simbol" style={S.input} />
          <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={S.input}>
            {d.all_categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input value={form.conversion} onChange={e => setForm({ ...form, conversion: e.target.value })} placeholder="Konversi ke dasar" type="number" style={S.input} />
          <button onClick={add} style={S.btn}>+ Satuan</button>
        </div>
        {msg ? <div style={{ fontSize: 12, marginTop: 8, color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}
      </div>

      {d.categories.map(g => (
        <div key={g.category} style={{ ...S.card, marginTop: 14, borderTop: `2px solid ${CAT_C[g.category]}` }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: CAT_C[g.category] }}>{g.category.toUpperCase()}</span>
            <span style={{ fontSize: 10, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>satuan dasar: {g.base_unit}</span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
            <thead>
              <tr style={{ color: "#5b6470", fontSize: 10, textAlign: "left" }}>
                {["KODE", "NAMA", "SIMBOL", "KONVERSI", "STATUS", "AKSI"].map(h => <th key={h} style={{ padding: "5px 8px", fontWeight: 600 }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {g.units.map(u => (
                <tr key={u.id} style={{ borderTop: "1px solid #161b22", fontSize: 12 }}>
                  <td style={{ ...S.td, ...S.mono, color: "#5b6470" }}>{u.code}</td>
                  <td style={{ ...S.td, color: "#e6edf3", fontWeight: 600 }}>{u.name}</td>
                  <td style={{ ...S.td, ...S.mono, color: "#9da7b3" }}>{u.symbol}</td>
                  <td style={{ ...S.td, ...S.mono, color: "#9da7b3" }}>
                    {u.conversion === 1 ? <span style={{ color: "#5b6470" }}>satuan dasar</span> : `1 ${u.symbol} = ${u.conversion} ${u.base_unit}`}
                  </td>
                  <td style={S.td}>
                    <button onClick={() => toggle(u)} style={{ fontSize: 9, fontWeight: 700, color: u.is_active ? "#10b981" : "#5b6470", background: (u.is_active ? "#10b981" : "#5b6470") + "1f", border: `1px solid ${(u.is_active ? "#10b981" : "#5b6470")}55`, borderRadius: 5, padding: "3px 8px", fontFamily: "'Geist Mono',monospace", cursor: "pointer" }}>
                      {u.is_active ? "● AKTIF" : "○ OFF"}
                    </button>
                  </td>
                  <td style={S.td}>
                    <span style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => setEditing({ ...u })} title="Edit" style={{ background: "#f59e0b18", border: "1px solid #f59e0b44", color: "#f59e0b", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>✏️</button>
                      <button onClick={() => remove(u)} title="Hapus" style={{ background: "#ef444418", border: "1px solid #ef444444", color: "#ef4444", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>🗑️</button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 12, padding: 22, maxWidth: 480, width: "100%" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 14 }}>✏️ Edit Satuan — {editing.code}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ gridColumn: "1/-1" }}><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>NAMA SATUAN</div><input value={editing.name || ""} onChange={e => setEditing({ ...editing, name: e.target.value })} style={S.input} /></div>
              <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>SIMBOL</div><input value={editing.symbol || ""} onChange={e => setEditing({ ...editing, symbol: e.target.value })} style={S.input} /></div>
              <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>KATEGORI</div>
                <select value={editing.category || "Jumlah"} onChange={e => setEditing({ ...editing, category: e.target.value })} style={S.input}>
                  {d.all_categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>BASE UNIT</div><input value={editing.base_unit || ""} onChange={e => setEditing({ ...editing, base_unit: e.target.value })} style={S.input} /></div>
              <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>KONVERSI</div><input type="number" step="0.001" value={editing.conversion || 1} onChange={e => setEditing({ ...editing, conversion: Number(e.target.value) })} style={S.input} /></div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button onClick={() => setEditing(null)} style={{ background: "#161b22", border: "1px solid #30363d", color: "#9ca3af", padding: "8px 14px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Batal</button>
              <button onClick={saveEdit} style={S.btn}>💾 Simpan</button>
            </div>
          </div>
        </div>
      )}
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
  mono: { fontFamily: "'Geist Mono',monospace" },
  input: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 7, padding: "8px 9px", color: "#e6edf3", fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" },
  btn: { background: "#0e7490", color: "#fff", border: "none", borderRadius: 7, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
};
