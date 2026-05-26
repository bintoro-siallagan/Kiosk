// karyaOS — Cinema F&B Bundles CRUD
// Combo popcorn/minuman yang muncul di customer cinema kiosk (step F&B).
import { useState, useEffect, useCallback } from "react";

const C = { card: "#0d1117", border: "#1b212c", sub: "#9ca3af", dim: "#5b6470" };
const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const empty = { name: "", description: "", price: 0, is_active: 1, sort_order: 0, outlet_codes: "", image_url: "" };

export default function CinemaBundles({ apiBase = "" }) {
  const base = (apiBase || "") + "/api/cinema";
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);   // bundle row being edited or null
  const [form, setForm] = useState(empty);
  const [outlets, setOutlets] = useState([]);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    fetch(`${apiBase}/api/outlet-master`).then(r => r.json())
      .then(d => setOutlets((d.outlets || d.data || []).filter(o => o.status === "active")))
      .catch(() => {});
  }, [apiBase]);
  const showToast = (m, kind = "ok") => { setToast({ m, kind }); setTimeout(() => setToast(null), 2500); };

  const load = useCallback(async () => {
    try { const r = await fetch(`${base}/bundles?all=1`); const d = await r.json(); setRows(d.bundles || []); }
    catch (e) { setRows([]); }
  }, [base]);
  useEffect(() => { load(); }, [load]);

  const startNew = () => { setEditing("new"); setForm(empty); };
  const startEdit = (b) => { setEditing(b.id); setForm({ ...b, is_active: b.is_active ? 1 : 0 }); };
  const cancel = () => { setEditing(null); setForm(empty); };

  async function save() {
    if (!form.name?.trim()) { showToast("Nama required", "err"); return; }
    try {
      if (editing === "new") {
        const r = await fetch(`${base}/bundles`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
        const d = await r.json();
        if (!d.ok) throw new Error(d.error || "Gagal simpan");
        showToast("Bundle baru disimpan");
      } else {
        const r = await fetch(`${base}/bundles/${editing}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
        const d = await r.json();
        if (!d.ok) throw new Error(d.error || "Gagal update");
        showToast("Bundle diperbarui");
      }
      cancel(); load();
    } catch (e) { showToast(e.message, "err"); }
  }

  async function remove(b) {
    if (!window.confirm(`Hapus bundle "${b.name}"? Data purchase yang sudah ada tidak terpengaruh.`)) return;
    try {
      const r = await fetch(`${base}/bundles/${b.id}`, { method: "DELETE" });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || "Gagal hapus");
      showToast("Bundle dihapus"); load();
    } catch (e) { showToast(e.message, "err"); }
  }

  async function toggleActive(b) {
    try {
      await fetch(`${base}/bundles/${b.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_active: !b.is_active }) });
      showToast(b.is_active ? "Bundle dinonaktifkan" : "Bundle diaktifkan"); load();
    } catch (e) { showToast(e.message, "err"); }
  }

  return (
    <div style={{ fontFamily: "'Inter',sans-serif", color: "#e6edf3" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14, marginBottom: 18 }}>
        <div>
          <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 19, fontWeight: 700, letterSpacing: 1 }}>🍿 Cinema F&B Bundles</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>Combo yang ditawarkan di customer cinema kiosk · ditukar di F&amp;B counter via QR tiket.</div>
        </div>
        {!editing && <button onClick={startNew} style={B.add}>＋ Bundle baru</button>}
      </div>

      {editing && (
        <div style={{ background: C.card, border: `1px solid #f59e0b66`, borderRadius: 14, padding: 18, marginBottom: 18 }}>
          <div style={{ fontSize: 13, color: "#fbbf24", marginBottom: 12, fontWeight: 700 }}>{editing === "new" ? "Bundle baru" : `Edit bundle #${editing}`}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Nama">
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Combo Popcorn + Coke" style={inp} />
            </Field>
            <Field label="Price (Rp)">
              <input type="number" value={form.price} onChange={e => setForm({ ...form, price: parseInt(e.target.value, 10) || 0 })} style={inp} />
            </Field>
            <Field label="Description" wide>
              <input value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Popcorn medium + Coca-Cola medium" style={inp} />
            </Field>
            <Field label="Urutan tampil">
              <input type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: parseInt(e.target.value, 10) || 0 })} style={inp} />
            </Field>
            <Field label="Status">
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={!!form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked ? 1 : 0 })} />
                <span>Active (tampil di kiosk)</span>
              </label>
            </Field>
            <Field label="🌐 Outlet (kosong = semua outlet)" wide>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "6px 8px", background: "#0a0e16", border: `1px solid ${C.border}`, borderRadius: 8, minHeight: 38 }}>
                {outlets.length === 0 && <span style={{ fontSize: 11, color: C.dim }}>Loading outlets...</span>}
                {outlets.map(o => {
                  const codes = String(form.outlet_codes || "").split(",").map(s => s.trim()).filter(Boolean);
                  const sel = codes.includes(o.code);
                  return (
                    <label key={o.code} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", background: sel ? "#f59e0b22" : "rgba(255,255,255,0.04)", border: `1px solid ${sel ? "#f59e0b66" : "transparent"}`, borderRadius: 999, fontSize: 11, cursor: "pointer", color: sel ? "#fbbf24" : "#cbd5e1" }}>
                      <input type="checkbox" checked={sel} style={{ margin: 0 }} onChange={(e) => {
                        const next = new Set(codes);
                        if (e.target.checked) next.add(o.code); else next.delete(o.code);
                        setForm({ ...form, outlet_codes: [...next].join(",") });
                      }} />
                      {o.code}
                    </label>
                  );
                })}
              </div>
              <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>Centang outlet yang menjual bundle ini. Kosongkan for global (semua outlet).</div>
            </Field>
            <Field label="🖼️ Image URL (opsional)" wide>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {form.image_url && <img src={form.image_url.startsWith("/") ? apiBase + form.image_url : form.image_url} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6, border: `1px solid ${C.border}` }} />}
                <input value={form.image_url || ""} onChange={e => setForm({ ...form, image_url: e.target.value })} placeholder="or upload via tombol →" style={{ ...inp, flex: 1 }} />
                <label style={{ background: "#22d3ee22", border: "1px solid #22d3ee66", color: "#22d3ee", borderRadius: 8, padding: "8px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                  📤 Upload
                  <input type="file" accept="image/*" style={{ display: "none" }} onChange={async (e) => {
                    const file = e.target.files?.[0]; if (!file) return;
                    showToast(`Uploading ${(file.size / 1024 / 1024).toFixed(1)}MB...`);
                    try {
                      const fd = new FormData(); fd.append("file", file);
                      const r = await fetch(`${apiBase}/api/upload`, { method: "POST", body: fd });
                      const d = await r.json();
                      if (!d.ok) throw new Error(d.error);
                      setForm(f => ({ ...f, image_url: d.url }));
                      showToast("Image uploaded");
                    } catch (err) { showToast(err.message, "err"); }
                  }} />
                </label>
              </div>
            </Field>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button onClick={save} style={B.save}>{editing === "new" ? "Buat bundle" : "Simpan perubahan"}</button>
            <button onClick={cancel} style={B.cancel}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ ...row, color: C.dim, fontSize: 11, letterSpacing: 1, padding: "10px 14px", borderBottom: `1px solid ${C.border}` }}>
          <span style={{ width: 50 }}>#</span>
          <span style={{ flex: 1.4 }}>NAME</span>
          <span style={{ flex: 1.6 }}>DESKRIPSI</span>
          <span style={{ width: 110, textAlign: "right" }}>HARGA</span>
          <span style={{ width: 70 }}>STATUS</span>
          <span style={{ width: 60, textAlign: "right" }}>URUT</span>
          <span style={{ width: 150, textAlign: "right" }}>ACTIONS</span>
        </div>
        {rows.length === 0 ? (
          <div style={{ padding: "22px 14px", textAlign: "center", color: C.sub, fontSize: 13 }}>No bundle. Klik "Bundle baru" for membuat.</div>
        ) : rows.map(b => (
          <div key={b.id} style={{ ...row, padding: "12px 14px", borderBottom: `1px solid ${C.border}` }}>
            <span style={{ width: 50, fontFamily: "'Geist Mono',monospace", fontSize: 12, color: C.dim }}>{b.id}</span>
            <span style={{ flex: 1.4, fontWeight: 700, fontSize: 13 }}>
              {b.image_url && <img src={b.image_url.startsWith("/") ? apiBase + b.image_url : b.image_url} alt="" style={{ width: 24, height: 24, objectFit: "cover", borderRadius: 4, marginRight: 8, verticalAlign: "middle" }} />}
              {b.name}
            </span>
            <span style={{ flex: 1.6, fontSize: 12.5, color: C.sub }}>
              {b.description || "—"}
              {b.outlet_codes && <span style={{ display: "inline-block", marginLeft: 8, padding: "2px 7px", background: "#a855f722", border: "1px solid #a855f766", color: "#c084fc", borderRadius: 6, fontSize: 10, fontWeight: 700, fontFamily: "'Geist Mono',monospace" }}>📍 {b.outlet_codes}</span>}
            </span>
            <span style={{ width: 110, textAlign: "right", fontFamily: "'Geist Mono',monospace", fontWeight: 700, color: "#10b981" }}>{rp(b.price)}</span>
            <span style={{ width: 70 }}>
              {b.is_active
                ? <span style={pill("#10b981")}>aktif</span>
                : <span style={pill("#6b7280")}>off</span>}
            </span>
            <span style={{ width: 60, textAlign: "right", fontFamily: "'Geist Mono',monospace", fontSize: 12, color: C.sub }}>{b.sort_order || 0}</span>
            <span style={{ width: 150, textAlign: "right", display: "flex", justifyContent: "flex-end", gap: 6 }}>
              <button onClick={() => toggleActive(b)} style={B.small(b.is_active ? "#6b7280" : "#10b981")}>{b.is_active ? "Off" : "On"}</button>
              <button onClick={() => startEdit(b)} style={B.small("#a855f7")}>Edit</button>
              <button onClick={() => remove(b)} style={B.small("#ef4444")}>×</button>
            </span>
          </div>
        ))}
      </div>

      {toast && (
        <div style={{
          position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
          background: toast.kind === "err" ? "#7f1d1d" : "#14532d",
          border: `1px solid ${toast.kind === "err" ? "#ef4444" : "#22c55e"}`,
          color: "#fff", padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 9999,
        }}>{toast.m}</div>
      )}
    </div>
  );
}

function Field({ label, children, wide }) {
  return (
    <div style={{ gridColumn: wide ? "span 2" : "auto" }}>
      <div style={{ fontSize: 11, color: "#5b6470", letterSpacing: 1, fontFamily: "'Geist Mono',monospace", marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}

const row = { display: "flex", alignItems: "center", gap: 12 };
const inp = { width: "100%", padding: "9px 11px", background: "#0a0e16", border: `1px solid ${C.border}`, borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" };
const pill = (color) => ({ background: color + "22", color, padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600 });
const B = {
  add:    { background: "#f59e0b22", border: "1px solid #f59e0b66", color: "#fbbf24", padding: "9px 18px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  save:   { background: "#10b981", border: "none", color: "#04130c", padding: "9px 20px", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  cancel: { background: "#1b212c", border: "1px solid #2a2b30", color: "#9ca3af", padding: "9px 18px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  small: (color) => ({ background: color + "18", border: `1px solid ${color}44`, color, padding: "4px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }),
};
