// karyaOS — Cinema Holiday Calendar
// Tanggal libur nasional Indonesia + custom. Otomatis dipakai oleh
// price-list resolver → day_type='holiday' (overrides weekend/weekday).
import { useState, useEffect, useCallback } from "react";

const C = { card: "#0d1117", border: "#1b212c", sub: "#9ca3af", dim: "#5b6470" };

export default function CinemaHolidays({ apiBase = "" }) {
  const base = (apiBase || "") + "/api/cinema";
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ date: "", name: "", notes: "" });
  const [toast, setToast] = useState(null);
  const showToast = (m, kind = "ok") => { setToast({ m, kind }); setTimeout(() => setToast(null), 2200); };
  const load = useCallback(async () => {
    const r = await fetch(`${base}/holidays`); const d = await r.json();
    setRows(d.holidays || []);
  }, [base]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!form.date || !form.name) { showToast("Tanggal + nama wajib", "err"); return; }
    const r = await fetch(`${base}/holidays`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const d = await r.json();
    if (!d.ok) { showToast(d.error || "Gagal", "err"); return; }
    setForm({ date: "", name: "", notes: "" });
    showToast("Tanggal libur ditambahkan"); load();
  };
  const remove = async (r) => {
    if (!window.confirm(`Hapus ${r.name} (${r.date})?`)) return;
    await fetch(`${base}/holidays/${r.id}`, { method: "DELETE" }); showToast("Dihapus"); load();
  };
  const toggle = async (r) => {
    await fetch(`${base}/holidays/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_active: !r.is_active }) });
    load();
  };

  return (
    <div style={{ fontFamily: "'Inter',sans-serif", color: "#e6edf3" }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 19, fontWeight: 700, letterSpacing: 1 }}>📅 Cinema Holiday Calendar</div>
        <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>Auto-dipakai oleh Price List Master · day_type='holiday' override weekend/weekday.</div>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, marginBottom: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} style={{ ...inp, width: 150 }} />
        <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nama libur (mis: Lebaran)" style={{ ...inp, flex: 1, minWidth: 200 }} />
        <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Catatan (opsional)" style={{ ...inp, flex: 1, minWidth: 150 }} />
        <button onClick={add} style={{ background: "#10b981", border: "none", color: "#04130c", padding: "9px 22px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>＋ Tambah</button>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "flex", padding: "8px 14px", borderBottom: `1px solid ${C.border}`, color: C.dim, fontSize: 11, letterSpacing: 1, gap: 10 }}>
          <span style={{ width: 110 }}>TANGGAL</span>
          <span style={{ flex: 1 }}>NAMA</span>
          <span style={{ flex: 1 }}>CATATAN</span>
          <span style={{ width: 70 }}>STATUS</span>
          <span style={{ width: 100, textAlign: "right" }}>AKSI</span>
        </div>
        {rows.length === 0 ? <div style={{ padding: 22, textAlign: "center", color: C.sub, fontSize: 13 }}>Belum ada tanggal libur.</div> :
          rows.map(r => (
            <div key={r.id} style={{ display: "flex", padding: "10px 14px", borderBottom: `1px solid ${C.border}`, gap: 10, alignItems: "center" }}>
              <span style={{ width: 110, fontFamily: "'Geist Mono',monospace", fontSize: 13, color: r.is_active ? "#fbbf24" : C.dim }}>{r.date}</span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: r.is_active ? "#fff" : C.dim }}>{r.name}</span>
              <span style={{ flex: 1, fontSize: 12, color: C.sub }}>{r.notes || "—"}</span>
              <span style={{ width: 70 }}>
                {r.is_active ? <span style={{ background: "#10b98122", color: "#10b981", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600 }}>aktif</span> : <span style={{ background: "#6b728022", color: "#9ca3af", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600 }}>off</span>}
              </span>
              <span style={{ width: 100, textAlign: "right", display: "flex", gap: 5, justifyContent: "flex-end" }}>
                <button onClick={() => toggle(r)} style={B(r.is_active ? "#6b7280" : "#10b981")}>{r.is_active ? "Off" : "On"}</button>
                <button onClick={() => remove(r)} style={B("#ef4444")}>×</button>
              </span>
            </div>
          ))
        }
      </div>

      {toast && (
        <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
          background: toast.kind === "err" ? "#7f1d1d" : "#14532d", border: `1px solid ${toast.kind === "err" ? "#ef4444" : "#22c55e"}`,
          color: "#fff", padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 9999 }}>{toast.m}</div>
      )}
    </div>
  );
}

const inp = { padding: "9px 12px", background: "#0a0e16", border: `1px solid ${C.border}`, borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" };
const B = (color) => ({ background: color + "18", border: `1px solid ${color}44`, color, padding: "4px 9px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });
