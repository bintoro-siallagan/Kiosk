// karyaOS — F&B Delivery & Drivers (3 tab: drivers, zones, deliveries queue)
import { useState, useEffect, useCallback } from "react";
import { useUiKit, TooltipButton } from "../components/uiKit.jsx";
const C = { card: "#0d1117", border: "#1b212c", sub: "#9ca3af", dim: "#5b6470" };
const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const fmtTs = (s) => s ? new Date(s * 1000).toLocaleString("id-ID", { hour12: false }) : "—";
const DRIVER_STATUS = { available: { label: "Available", color: "#10b981" }, on_delivery: { label: "On Delivery", color: "#f59e0b" }, off_duty: { label: "Off Duty", color: "#6b7280" }, suspended: { label: "Suspended", color: "#ef4444" } };
const DEL_STATUS = { pending: { label: "Pending", color: "#f59e0b" }, assigned: { label: "Assigned", color: "#22d3ee" }, picked_up: { label: "Picked-up", color: "#a855f7" }, on_the_way: { label: "On the way", color: "#3b82f6" }, delivered: { label: "Delivered", color: "#10b981" }, failed: { label: "Failed", color: "#ef4444" }, cancelled: { label: "Cancelled", color: "#6b7280" } };

export default function FnbDelivery({ apiBase = "" }) {
  const base = (apiBase || "") + "/api/fnb";
  const [tab, setTab] = useState("queue");
  const [toast, setToast] = useState(null);
  const showToast = (m, k = "ok") => { setToast({ m, k }); setTimeout(() => setToast(null), 2200); };
  return (
    <div style={{ fontFamily: "'Inter',sans-serif", color: "#e6edf3" }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 19, fontWeight: 700, letterSpacing: 1 }}>🚴 F&B Delivery & Drivers</div>
        <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>Self-delivery: drivers, zones (zone-based fee), deliveries queue.</div>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {[["queue", "📦 Queue"], ["drivers", "🚴 Drivers"], ["zones", "📍 Zones"]].map(([id, l]) => (
          <button key={id} onClick={() => setTab(id)} style={{ background: tab === id ? "#3b82f622" : "transparent", border: `1px solid ${tab === id ? "#3b82f666" : C.border}`, borderRadius: 8, padding: "8px 14px", color: tab === id ? "#fff" : C.sub, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{l}</button>
        ))}
      </div>
      {tab === "queue"   && <QueueTab base={base} showToast={showToast} />}
      {tab === "drivers" && <DriversTab base={base} showToast={showToast} />}
      {tab === "zones"   && <ZonesTab base={base} showToast={showToast} />}
      {toast && <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: toast.k === "err" ? "#7f1d1d" : "#14532d", border: `1px solid ${toast.k === "err" ? "#ef4444" : "#22c55e"}`, color: "#fff", padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 9999 }}>{toast.m}</div>}
    </div>
  );
}

function QueueTab({ base, showToast }) {
  const [rows, setRows] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [filter, setFilter] = useState("");
  const load = useCallback(async () => {
    const p = filter ? `?status=${filter}` : "";
    const d = await fetch(`${base}/deliveries${p}`).then(r => r.json()); setRows(d.deliveries || []);
    fetch(`${base}/drivers`).then(r => r.json()).then(d => setDrivers(d.drivers || []));
  }, [base, filter]);
  useEffect(() => { load(); const iv = setInterval(load, 15000); return () => clearInterval(iv); }, [load]);
  const setStatus = async (r, body) => { await fetch(`${base}/deliveries/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); load(); };
  return (
    <>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {[["", "Semua"], ["pending", "Pending"], ["assigned", "Assigned"], ["on_the_way", "On The Way"], ["delivered", "Delivered"]].map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)} style={{ background: filter === v ? "#a855f72a" : "transparent", border: `1px solid ${filter === v ? "#a855f766" : C.border}`, borderRadius: 8, padding: "7px 14px", color: filter === v ? "#fff" : C.sub, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{l}</button>
        ))}
      </div>
      {rows.length === 0 ? <Empty>None delivery.</Empty> :
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(360px,1fr))", gap: 12 }}>
          {rows.map(r => {
            const st = DEL_STATUS[r.status] || DEL_STATUS.pending;
            return (
              <div key={r.id} style={{ background: C.card, border: `2px solid ${st.color}55`, borderRadius: 14, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <div>
                    <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 13, color: "#22d3ee", letterSpacing: 1.5 }}>{r.delivery_code}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{r.customer_name || "—"}</div>
                    <div style={{ fontSize: 11.5, color: C.sub }}>{r.customer_phone}</div>
                  </div>
                  <span style={{ background: st.color + "22", color: st.color, padding: "3px 9px", borderRadius: 7, fontSize: 11, fontWeight: 700 }}>{st.label}</span>
                </div>
                <div style={{ background: "#0a0e16", borderRadius: 9, padding: "8px 11px", marginBottom: 8, fontSize: 12, lineHeight: 1.5 }}>
                  <div>📍 {r.delivery_address}</div>
                  {r.zone_name && <div>🗺️ Zone: {r.zone_name}</div>}
                  <div>💰 Fee: <b style={{ color: "#10b981", fontFamily: "'Geist Mono',monospace" }}>{rp(r.delivery_fee)}</b></div>
                  {r.driver_name && <div>🚴 Driver: <b>{r.driver_name}</b> {r.driver_phone}</div>}
                </div>
                {r.status === "pending" && (
                  <select onChange={e => e.target.value && setStatus(r, { driver_id: parseInt(e.target.value, 10), status: "assigned" })} defaultValue="" style={{ ...inp, marginBottom: 8 }}>
                    <option value="">— Pilih driver —</option>
                    {drivers.filter(d => d.status === "available").map(d => <option key={d.id} value={d.id}>{d.name} · {d.vehicle_plate}</option>)}
                  </select>
                )}
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {r.status === "assigned"   && <button onClick={() => setStatus(r, { status: "picked_up" })} style={Ba("#a855f7")}>📦 Picked Up</button>}
                  {r.status === "picked_up"  && <button onClick={() => setStatus(r, { status: "on_the_way" })} style={Ba("#3b82f6")}>🛵 On the way</button>}
                  {r.status === "on_the_way" && <button onClick={() => setStatus(r, { status: "delivered" })} style={Ba("#10b981")}>✓ Delivered</button>}
                  {!["delivered", "cancelled", "failed"].includes(r.status) && <button onClick={() => setStatus(r, { status: "failed", failed_reason: prompt("Alasan gagal:") || "" })} style={Ba("#ef4444")}>✕ Failed</button>}
                </div>
                <div style={{ fontSize: 10, color: C.dim, marginTop: 8 }}>Dibuat {fmtTs(r.created_at)}</div>
              </div>
            );
          })}
        </div>
      }
    </>
  );
}

function DriversTab({ base, showToast }) {
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", phone: "", vehicle_type: "motor", vehicle_plate: "", status: "available", outlet: "", is_active: 1 });
  const load = useCallback(async () => { const d = await fetch(`${base}/drivers?all=1`).then(r => r.json()); setRows(d.drivers || []); }, [base]);
  useEffect(() => { load(); }, [load]);
  const save = async () => {
    if (!form.name) { showToast("Nama wajib", "err"); return; }
    const url = editing === "new" ? `${base}/drivers` : `${base}/drivers/${editing}`;
    const r = await fetch(url, { method: editing === "new" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const d = await r.json(); if (!d.ok) { showToast(d.error, "err"); return; }
    showToast("Driver disimpan"); setEditing(null); load();
  };
  const { confirm } = useUiKit();
  const remove = async (r) => { if (!(await confirm({ title: `Hapus driver "${r.name}"?`, message: "History delivery driver akan tetap tersimpan.", danger: true, okLabel: "Delete" }))) return; await fetch(`${base}/drivers/${r.id}`, { method: "DELETE" }); load(); };
  return (
    <>
      <div style={{ marginBottom: 12 }}>{!editing && <button onClick={() => { setEditing("new"); setForm({ name: "", phone: "", vehicle_type: "motor", vehicle_plate: "", status: "available", outlet: "", is_active: 1 }); }} style={B.add}>＋ Driver baru</button>}</div>
      {editing && (
        <div style={{ background: C.card, border: "1px solid #3b82f666", borderRadius: 14, padding: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#3b82f6", marginBottom: 10 }}>{editing === "new" ? "Driver baru" : `Edit #${editing}`}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <Field label="Nama"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inp} /></Field>
            <Field label="Phone"><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} style={inp} /></Field>
            <Field label="Outlet"><input value={form.outlet} onChange={e => setForm({ ...form, outlet: e.target.value })} style={inp} /></Field>
            <Field label="Tipe kendaraan"><select value={form.vehicle_type} onChange={e => setForm({ ...form, vehicle_type: e.target.value })} style={inp}><option value="motor">Motor</option><option value="mobil">Mobil</option><option value="sepeda">Sepeda</option></select></Field>
            <Field label="Plat nomor"><input value={form.vehicle_plate} onChange={e => setForm({ ...form, vehicle_plate: e.target.value })} style={inp} /></Field>
            <Field label="Status"><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} style={inp}>{Object.entries(DRIVER_STATUS).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}</select></Field>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button onClick={save} style={B.save}>{editing === "new" ? "Create" : "Save"}</button>
            <button onClick={() => setEditing(null)} style={B.cancel}>Cancel</button>
          </div>
        </div>
      )}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "flex", padding: "8px 14px", borderBottom: `1px solid ${C.border}`, color: C.dim, fontSize: 11, letterSpacing: 1, gap: 10 }}>
          <span style={{ flex: 1.3 }}>NAME</span><span style={{ width: 130 }}>PHONE</span><span style={{ width: 100 }}>KENDARAAN</span><span style={{ width: 110 }}>PLAT</span><span style={{ width: 110 }}>STATUS</span><span style={{ width: 80 }}>DELIV</span><span style={{ width: 70 }}>RATING</span><span style={{ width: 100, textAlign: "right" }}>ACTIONS</span>
        </div>
        {rows.length === 0 ? <Empty>No driver.</Empty> : rows.map(r => {
          const st = DRIVER_STATUS[r.status] || DRIVER_STATUS.off_duty;
          return (
            <div key={r.id} style={{ display: "flex", padding: "10px 14px", borderBottom: `1px solid ${C.border}`, gap: 10, alignItems: "center" }}>
              <span style={{ flex: 1.3, fontWeight: 700 }}>{r.name}{r.outlet ? <span style={{ color: C.dim, fontSize: 11, marginLeft: 6 }}>· {r.outlet}</span> : null}</span>
              <span style={{ width: 130, fontSize: 12, color: C.sub }}>{r.phone}</span>
              <span style={{ width: 100, fontSize: 12, color: C.sub }}>{r.vehicle_type}</span>
              <span style={{ width: 110, fontFamily: "'Geist Mono',monospace", fontSize: 12 }}>{r.vehicle_plate}</span>
              <span style={{ width: 110 }}><span style={{ background: st.color + "22", color: st.color, padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700 }}>{st.label}</span></span>
              <span style={{ width: 80, fontFamily: "'Geist Mono',monospace", fontSize: 12 }}>{r.total_deliveries || 0}</span>
              <span style={{ width: 70, color: "#fbbf24", fontWeight: 700 }}>★ {r.rating}</span>
              <span style={{ width: 100, display: "flex", gap: 4, justifyContent: "flex-end" }}>
                <button onClick={() => { setEditing(r.id); setForm({ ...r }); }} style={Ba("#a855f7")}>Edit</button>
                <button onClick={() => remove(r)} style={Ba("#ef4444")}>×</button>
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function ZonesTab({ base, showToast }) {
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const empty = { name: "", outlet: "", postal_codes: "", area_keywords: "", base_fee: 8000, per_km_fee: 0, min_order: 0, free_delivery_threshold: "", max_distance_km: 5, estimated_minutes: 30, is_active: 1 };
  const [form, setForm] = useState(empty);
  const load = useCallback(async () => { const d = await fetch(`${base}/delivery-zones?all=1`).then(r => r.json()); setRows(d.zones || []); }, [base]);
  useEffect(() => { load(); }, [load]);
  const save = async () => {
    if (!form.name) { showToast("Nama wajib", "err"); return; }
    const url = editing === "new" ? `${base}/delivery-zones` : `${base}/delivery-zones/${editing}`;
    const r = await fetch(url, { method: editing === "new" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const d = await r.json(); if (!d.ok) { showToast(d.error, "err"); return; }
    showToast("Zone disimpan"); setEditing(null); setForm(empty); load();
  };
  const { confirm } = useUiKit();
  const remove = async (r) => { if (!(await confirm({ title: `Hapus zone "${r.name}"?`, danger: true, okLabel: "Delete" }))) return; await fetch(`${base}/delivery-zones/${r.id}`, { method: "DELETE" }); load(); };
  return (
    <>
      <div style={{ marginBottom: 12 }}>{!editing && <button onClick={() => { setEditing("new"); setForm(empty); }} style={B.add}>＋ Zone baru</button>}</div>
      {editing && (
        <div style={{ background: C.card, border: "1px solid #06b6d466", borderRadius: 14, padding: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#06b6d4", marginBottom: 10 }}>{editing === "new" ? "Zone baru" : `Edit #${editing}`}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <Field label="Nama zone"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Zone A (0-3km)" style={inp} /></Field>
            <Field label="Outlet"><input value={form.outlet} onChange={e => setForm({ ...form, outlet: e.target.value })} style={inp} /></Field>
            <Field label="Max distance (km)"><input type="number" step="0.5" value={form.max_distance_km} onChange={e => setForm({ ...form, max_distance_km: parseFloat(e.target.value) || 0 })} style={inp} /></Field>
            <Field label="Base fee (Rp)"><input type="number" value={form.base_fee} onChange={e => setForm({ ...form, base_fee: parseInt(e.target.value, 10) || 0 })} style={inp} /></Field>
            <Field label="Per km fee (Rp)"><input type="number" value={form.per_km_fee} onChange={e => setForm({ ...form, per_km_fee: parseInt(e.target.value, 10) || 0 })} style={inp} /></Field>
            <Field label="Min order (Rp)"><input type="number" value={form.min_order} onChange={e => setForm({ ...form, min_order: parseInt(e.target.value, 10) || 0 })} style={inp} /></Field>
            <Field label="Free delivery threshold (Rp)"><input type="number" value={form.free_delivery_threshold || ""} onChange={e => setForm({ ...form, free_delivery_threshold: e.target.value })} style={inp} /></Field>
            <Field label="ETA (min)"><input type="number" value={form.estimated_minutes} onChange={e => setForm({ ...form, estimated_minutes: parseInt(e.target.value, 10) || 0 })} style={inp} /></Field>
            <Field label="Status"><label style={{ display: "flex", gap: 8, fontSize: 13, alignItems: "center" }}><input type="checkbox" checked={!!form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked ? 1 : 0 })} /> Active</label></Field>
            <Field label="Postal codes (CSV)" wide><input value={form.postal_codes} onChange={e => setForm({ ...form, postal_codes: e.target.value })} style={inp} /></Field>
            <Field label="Keyword area (CSV)" wide><input value={form.area_keywords} onChange={e => setForm({ ...form, area_keywords: e.target.value })} placeholder="paskal,sayati,setiabudi" style={inp} /></Field>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button onClick={save} style={B.save}>{editing === "new" ? "Create" : "Save"}</button>
            <button onClick={() => { setEditing(null); setForm(empty); }} style={B.cancel}>Cancel</button>
          </div>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 12 }}>
        {rows.map(r => (
          <div key={r.id} style={{ background: C.card, border: `1px solid ${r.is_active ? "#06b6d466" : C.border}`, borderRadius: 14, padding: 14, opacity: r.is_active ? 1 : 0.5 }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{r.name}</div>
            {r.outlet && <div style={{ fontSize: 11, color: C.sub }}>🏪 {r.outlet}</div>}
            <div style={{ background: "#0a0e16", borderRadius: 9, padding: "8px 11px", marginTop: 8, fontSize: 12, lineHeight: 1.6 }}>
              <div>💰 Base <b style={{ color: "#10b981", fontFamily: "'Geist Mono',monospace" }}>{rp(r.base_fee)}</b> · per km <b style={{ fontFamily: "'Geist Mono',monospace" }}>{rp(r.per_km_fee)}</b></div>
              <div>📏 Max {r.max_distance_km} km · ETA {r.estimated_minutes} mnt</div>
              {r.min_order > 0 && <div>🛒 Min order <b>{rp(r.min_order)}</b></div>}
              {r.free_delivery_threshold && <div>🎁 Gratis ongkir ≥ <b>{rp(r.free_delivery_threshold)}</b></div>}
              {r.area_keywords && <div style={{ color: C.dim, fontSize: 11, marginTop: 3 }}>🗺️ {r.area_keywords}</div>}
            </div>
            <div style={{ display: "flex", gap: 5, marginTop: 8 }}>
              <button onClick={() => { setEditing(r.id); setForm({ ...empty, ...r }); }} style={Ba("#a855f7")}>Edit</button>
              <button onClick={() => remove(r)} style={Ba("#ef4444")}>×</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function Field({ label, children, wide }) { return <div style={{ gridColumn: wide ? "span 2" : "auto" }}><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, fontFamily: "'Geist Mono',monospace", marginBottom: 4 }}>{label}</div>{children}</div>; }
function Empty({ children }) { return <div style={{ padding: "30px 18px", textAlign: "center", color: C.sub, fontSize: 13 }}>{children}</div>; }
const inp = { width: "100%", padding: "8px 11px", background: "#0a0e16", border: `1px solid ${C.border}`, borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" };
const B = { add: { background: "#3b82f622", border: "1px solid #3b82f666", color: "#60a5fa", padding: "9px 18px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }, save: { background: "#10b981", border: "none", color: "#04130c", padding: "9px 20px", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }, cancel: { background: "#1b212c", border: "1px solid #2a2b30", color: "#9ca3af", padding: "9px 18px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" } };
const Ba = (color) => ({ background: color + "18", border: `1px solid ${color}44`, color, padding: "4px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });
