// src/Admin/AdminSupplierMaster.jsx
// Supplier/Vendor Master — registry vendor + scorecard (CRUD lengkap).

import { useState, useEffect, useCallback } from "react";
import { useUiKit } from "../components/uiKit.jsx";

const AC = "#8b5cf6";
const GRADE_C = { A: "#10b981", B: "#3b82f6", C: "#f59e0b", D: "#ef4444" };

export default function AdminSupplierMaster({ apiBase = "" }) {
  const { confirm } = useUiKit();
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ name: "", category: "Bahan Baku", contact: "", phone: "", payment_terms: "NET 30" });
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/supplier-master`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const add = () => {
    if (!form.name.trim()) { setMsg("⚠ Nama vendor wajib"); return; }
    fetch(`${apiBase}/api/supplier-master`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    }).then(r => r.json()).then(j => {
      if (j.ok) { setMsg("✓ Vendor ditambah"); setForm({ ...form, name: "", contact: "", phone: "" }); load(); }
      else setMsg(j.error || "gagal");
    }).catch(e => setMsg(String(e)));
  };
  const toggle = (v) => {
    fetch(`${apiBase}/api/supplier-master/${v.id}/toggle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      .then(r => r.json()).then(j => { if (j.ok) load(); }).catch(() => {});
  };
  const saveEdit = async () => {
    const r = await fetch(`${apiBase}/api/supplier-master/${editing.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing),
    });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Vendor disimpan"); setEditing(null); load(); }
    else setMsg(j.error || "gagal");
  };
  const remove = async (v) => {
    const ok = await confirm({ title: `Hapus vendor "${v.name}"?`, message: `Vendor ${v.code} akan dihapus permanen dari registry. Tidak bisa dibatalkan.`, danger: true, okLabel: "Hapus" });
    if (!ok) return;
    const r = await fetch(`${apiBase}/api/supplier-master/${v.id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Vendor dihapus"); load(); }
    else setMsg(j.error || "gagal");
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Supplier Master…</div>;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        🏭 <b style={{ color: "#a78bfa" }}>SUPPLIER / VENDOR MASTER</b> — registry vendor terpusat +
        scorecard: on-time delivery, kualitas &amp; harga → grade A/B/C/D.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Vendor" v={String(s.total)} c={AC} />
        <Kpi label="Aktif" v={String(s.active)} c="#10b981" />
        <Kpi label="Avg Score" v={String(s.avg_score)} c={s.avg_score >= 85 ? "#10b981" : "#f59e0b"} />
        <Kpi label="Grade A" v={String(s.grade_a)} c="#10b981" />
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>➕ TAMBAH VENDOR</div>
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1.1fr 1.1fr 1fr 0.9fr auto", gap: 8, marginTop: 10 }}>
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nama vendor" style={S.input} />
          <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={S.input}>
            {d.categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} placeholder="Kontak" style={S.input} />
          <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="Telepon" style={S.input} />
          <input value={form.payment_terms} onChange={e => setForm({ ...form, payment_terms: e.target.value })} placeholder="Termin" style={S.input} />
          <button onClick={add} style={S.btn}>+ Vendor</button>
        </div>
        {msg ? <div style={{ fontSize: 12, marginTop: 8, color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🏭 DAFTAR VENDOR + SCORECARD — {d.suppliers.length}</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
          <thead>
            <tr style={{ color: "#5b6470", fontSize: 10, textAlign: "left" }}>
              {["VENDOR", "KATEGORI", "TERMIN", "ON-TIME", "KUALITAS", "HARGA", "SCORE", "STATUS", "AKSI"].map(h => <th key={h} style={{ padding: "6px 8px", fontWeight: 600 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {d.suppliers.map(v => (
              <tr key={v.id} style={{ borderTop: "1px solid #161b22", fontSize: 12, opacity: v.is_active ? 1 : 0.45 }}>
                <td style={{ ...S.td }}>
                  <div style={{ color: "#e6edf3", fontWeight: 600 }}>{v.name}</div>
                  <div style={{ fontSize: 10, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>{v.code} · {v.contact}</div>
                </td>
                <td style={{ ...S.td, color: "#9da7b3" }}>{v.category}</td>
                <td style={{ ...S.td, ...S.mono, color: "#5b6470" }}>{v.payment_terms}</td>
                <td style={{ ...S.td, ...S.mono, color: "#9da7b3" }}>{v.on_time_pct}%</td>
                <td style={{ ...S.td, ...S.mono, color: "#9da7b3" }}>{v.quality_score}</td>
                <td style={{ ...S.td, ...S.mono, color: "#9da7b3" }}>{v.price_score}</td>
                <td style={S.td}>
                  <span style={{ fontSize: 12, fontWeight: 800, fontFamily: "'Geist Mono',monospace", color: GRADE_C[v.grade] }}>{v.total_score} </span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: "#fff", background: GRADE_C[v.grade], borderRadius: 4, padding: "1px 6px" }}>{v.grade}</span>
                </td>
                <td style={S.td}>
                  <button onClick={() => toggle(v)} style={{ fontSize: 9, fontWeight: 700, color: v.is_active ? "#10b981" : "#5b6470", background: (v.is_active ? "#10b981" : "#5b6470") + "1f", border: `1px solid ${(v.is_active ? "#10b981" : "#5b6470")}55`, borderRadius: 5, padding: "3px 8px", fontFamily: "'Geist Mono',monospace", cursor: "pointer" }}>
                    {v.is_active ? "● AKTIF" : "○ OFF"}
                  </button>
                </td>
                <td style={S.td}>
                  <span style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => setEditing({ ...v })} title="Edit vendor" style={{ background: "#f59e0b18", border: "1px solid #f59e0b44", color: "#f59e0b", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>✏️</button>
                    <button onClick={() => remove(v)} title="Hapus vendor" style={{ background: "#ef444418", border: "1px solid #ef444444", color: "#ef4444", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>🗑️</button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 12, padding: 22, maxWidth: 540, width: "100%" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 14 }}>✏️ Edit Vendor — {editing.code}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>NAMA *</div><input value={editing.name || ""} onChange={e => setEditing({ ...editing, name: e.target.value })} style={S.input} /></div>
              <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>KATEGORI</div>
                <select value={editing.category || ""} onChange={e => setEditing({ ...editing, category: e.target.value })} style={S.input}>
                  {d.categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>KONTAK</div><input value={editing.contact || ""} onChange={e => setEditing({ ...editing, contact: e.target.value })} style={S.input} /></div>
              <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>TELEPON</div><input value={editing.phone || ""} onChange={e => setEditing({ ...editing, phone: e.target.value })} style={S.input} /></div>
              <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>TERMIN</div><input value={editing.payment_terms || ""} onChange={e => setEditing({ ...editing, payment_terms: e.target.value })} style={S.input} /></div>
              <div></div>
              <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>ON-TIME %</div><input type="number" min="0" max="100" value={editing.on_time_pct || 0} onChange={e => setEditing({ ...editing, on_time_pct: Number(e.target.value) })} style={S.input} /></div>
              <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>KUALITAS</div><input type="number" min="0" max="100" value={editing.quality_score || 0} onChange={e => setEditing({ ...editing, quality_score: Number(e.target.value) })} style={S.input} /></div>
              <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>HARGA</div><input type="number" min="0" max="100" value={editing.price_score || 0} onChange={e => setEditing({ ...editing, price_score: Number(e.target.value) })} style={S.input} /></div>
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
  btn: { background: "#8b5cf6", color: "#fff", border: "none", borderRadius: 7, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
};
