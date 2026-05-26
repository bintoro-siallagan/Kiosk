// src/Admin/AdminMasterUnit.jsx
// Master Unit — master satuan / unit of measure inventory (CRUD lengkap).
// Refactored ke pattern uiKit `useCrud` + `<EditModal>` + `<CrudButtons>`.

import { useState, useEffect, useCallback } from "react";
import { useCrud, EditModal, CrudButtons } from "../components/uiKit.jsx";

const AC = "#0e7490";
const CAT_C = { Berat: "#f59e0b", Volume: "#3b82f6", Jumlah: "#10b981" };

export default function AdminMasterUnit({ apiBase = "" }) {
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ code: "", name: "", symbol: "", category: "Jumlah", conversion: "1" });

  const load = useCallback(() => {
    fetch(`${apiBase}/api/master-unit`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const crud = useCrud({ apiBase, path: "/api/master-unit", onChange: load, labelKey: "name" });

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
        <Kpi label="Active" v={String(s.active)} c="#10b981" />
        <Kpi label="Kategori" v={String(s.by_category.length)} c="#a855f7" />
        <Kpi label="Inactive" v={String(s.total - s.active)} c={s.total - s.active > 0 ? "#f59e0b" : "#5b6470"} />
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
          <input value={form.conversion} onChange={e => setForm({ ...form, conversion: e.target.value })} placeholder="Konversi to dasar" type="number" style={S.input} />
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
                    <CrudButtons onEdit={() => crud.openEdit(u)} onDelete={() => crud.remove(u)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <EditModal
        open={!!crud.editing}
        title={`Satuan — ${crud.editing?.code || ""}`}
        data={crud.editing}
        onChange={crud.setEditing}
        onClose={crud.cancel}
        onSave={crud.save}
        fields={[
          { key: "name", label: "Nama Satuan", required: true, span: 2 },
          { key: "symbol", label: "Simbol" },
          { key: "category", label: "Kategori", type: "select", options: (d.all_categories || []).map(c => [c, c]) },
          { key: "base_unit", label: "Base Unit" },
          { key: "conversion", label: "Konversi", type: "number", help: "1 unit = N base_unit" },
        ]}
      />
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
