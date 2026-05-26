// karyaOS — Cinema in-studio order queue (staff F&B fulfillment)
// Lihat pesanan customer per kursi, ubah status: pending → preparing → delivered.
import { useState, useEffect, useCallback } from "react";

const C = { card: "#0d1117", border: "#1b212c", sub: "#9ca3af", dim: "#5b6470" };
const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const fmtTs = (s) => s ? new Date(s * 1000).toLocaleTimeString("id-ID", { hour12: false }) : "—";
const STATUS = {
  pending:    { label: "Baru",       color: "#ef4444" },
  preparing:  { label: "Disiapkan",  color: "#f59e0b" },
  delivered:  { label: "Diantar",    color: "#10b981" },
  cancelled:  { label: "Dibatal",    color: "#6b7280" },
};
const modalInp = { background: "#0a0e16", border: "1px solid #30363d", borderRadius: 7, padding: "8px 11px", color: "#e6edf3", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", width: "100%" };

export default function CinemaInStudioQueue({ apiBase = "" }) {
  const base = (apiBase || "") + "/api/cinema";
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState("active");  // active | all | delivered
  const [staff, setStaff] = useState(localStorage.getItem("cinema_fnb_staff") || "");
  const [menu, setMenu] = useState([]);
  const [studios, setStudios] = useState([]);
  const [creating, setCreating] = useState(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const qs = filter === "active" ? "" : filter === "delivered" ? "?status=delivered" : "";
    const r = await fetch(`${base}/in-studio/orders${qs}`); const d = await r.json();
    let list = d.orders || [];
    if (filter === "active") list = list.filter(o => o.status === "pending" || o.status === "preparing");
    setOrders(list);
  }, [base, filter]);

  const loadMenu = useCallback(async () => {
    try {
      const r = await fetch(`${base}/in-studio/menu`); const d = await r.json();
      setMenu(d.items || []);
    } catch {}
    try {
      const r = await fetch(`${base}/studios`); const d = await r.json();
      setStudios(d.studios || []);
    } catch {}
  }, [base]);

  useEffect(() => {
    load();
    loadMenu();
    const iv = setInterval(load, 10000); // poll 10s
    return () => clearInterval(iv);
  }, [load, loadMenu]);

  const openCreate = () => {
    setMsg("");
    setCreating({
      seat: "", studio_id: "", studio_name: "",
      buyer_name: "", buyer_phone: "", notes: "",
      status: "pending", items: [],
    });
  };
  const addItem = () => {
    if (!menu.length) return;
    setCreating(c => ({ ...c, items: [...(c.items || []), { bundle_id: menu[0].id, qty: 1 }] }));
  };
  const updItem = (i, patch) => setCreating(c => ({ ...c, items: c.items.map((it, idx) => idx === i ? { ...it, ...patch } : it) }));
  const rmItem = (i) => setCreating(c => ({ ...c, items: c.items.filter((_, idx) => idx !== i) }));
  const submitCreate = async () => {
    if (!creating) return;
    if (!creating.seat || !creating.seat.trim()) { setMsg("⚠ Kursi required"); return; }
    if (!creating.items || !creating.items.length) { setMsg("⚠ Tambah minimal 1 item"); return; }
    const sd = studios.find(s => String(s.id) === String(creating.studio_id));
    const body = {
      seat: creating.seat.trim(),
      studio_id: creating.studio_id ? Number(creating.studio_id) : null,
      studio_name: sd ? sd.name : (creating.studio_name || ""),
      buyer_name: creating.buyer_name, buyer_phone: creating.buyer_phone,
      notes: creating.notes, status: creating.status,
      delivered_by: staff || "manual",
      items: creating.items.map(it => ({ bundle_id: Number(it.bundle_id), qty: Number(it.qty) || 1 })),
    };
    try {
      const r = await fetch(`${base}/in-studio/orders/manual`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const j = await r.json();
      if (j.ok) { setMsg(`✓ Order ${j.order_code} ditambah`); setCreating(null); load(); }
      else setMsg(j.error || "gagal");
    } catch (e) { setMsg(String(e.message || e)); }
  };

  async function patch(o, body) {
    if (staff?.trim()) localStorage.setItem("cinema_fnb_staff", staff.trim());
    await fetch(`${base}/in-studio/orders/${o.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, delivered_by: staff || "F&B" }),
    });
    load();
  }

  const counts = orders.reduce((a, o) => { a[o.status] = (a[o.status] || 0) + 1; return a; }, {});
  return (
    <div style={{ fontFamily: "'Inter',sans-serif", color: "#e6edf3" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14, marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 19, fontWeight: 700, letterSpacing: 1 }}>🍿 Cinema In-Studio Queue</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>Pesanan F&amp;B dari customer di kursi · auto-poll 10 detik.</div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input value={staff} onChange={e => setStaff(e.target.value)} placeholder="Nama staff (audit)" style={{ background: "#0a0e16", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", color: "#fff", fontSize: 12, fontFamily: "inherit" }} />
          <button onClick={openCreate} style={{ background: "#a855f7", border: "none", color: "#fff", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ Tambah Order Manual</button>
          <Stat label="Baru" value={counts.pending || 0} color={STATUS.pending.color} />
          <Stat label="Disiapkan" value={counts.preparing || 0} color={STATUS.preparing.color} />
        </div>
      </div>

      {msg && <div style={{ background: msg.startsWith("✓") ? "#10b98115" : "#ef444415", border: `1px solid ${msg.startsWith("✓") ? "#10b98133" : "#ef444433"}`, borderRadius: 8, padding: "8px 12px", color: msg.startsWith("✓") ? "#86efac" : "#fca5a5", fontSize: 12, marginBottom: 12 }}>{msg}</div>}

      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {[["active", "Active"], ["all", "Semua"], ["delivered", "Diantar"]].map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)}
            style={{ background: filter === id ? "#a855f72a" : "transparent", border: `1px solid ${filter === id ? "#a855f766" : C.border}`, borderRadius: 8, padding: "7px 14px", color: filter === id ? "#fff" : C.sub, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{label}</button>
        ))}
      </div>

      {orders.length === 0 ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "30px 18px", textAlign: "center", color: C.sub, fontSize: 13 }}>
          None pesanan.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 12 }}>
          {orders.map(o => {
            const st = STATUS[o.status] || STATUS.pending;
            return (
              <div key={o.id} style={{ background: C.card, border: `2px solid ${st.color}66`, borderRadius: 14, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 13, color: "#fbbf24", letterSpacing: 1.5 }}>{o.order_code}</div>
                    <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>{fmtTs(o.created_at)}</div>
                  </div>
                  <span style={{ background: st.color + "22", color: st.color, padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>{st.label}</span>
                </div>

                <div style={{ background: "#0a0e16", borderRadius: 10, padding: "8px 12px", marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.sub }}>
                    <span>Kursi</span><b style={{ color: "#fff", fontSize: 17 }}>{o.seat}</b>
                  </div>
                  {o.studio_name && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.sub }}><span>Studio</span><span style={{ color: "#fff" }}>{o.studio_name}</span></div>}
                  {o.buyer_name && <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>{o.buyer_name} {o.buyer_phone ? " · " + o.buyer_phone : ""}</div>}
                </div>

                <div style={{ marginBottom: 10 }}>
                  {(o.items || []).map((it, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0" }}>
                      <span><b style={{ color: "#fbbf24" }}>{it.qty}×</b> {it.bundle_name}</span>
                      <span style={{ color: C.sub, fontFamily: "'Geist Mono',monospace" }}>{rp(it.qty * it.price)}</span>
                    </div>
                  ))}
                </div>

                {o.notes && <div style={{ fontSize: 12, color: "#fbbf24", background: "#f59e0b15", borderRadius: 8, padding: "6px 10px", marginBottom: 10 }}>📝 {o.notes}</div>}

                <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${C.border}`, paddingTop: 8, marginBottom: 10 }}>
                  <b style={{ fontSize: 13 }}>Total</b>
                  <b style={{ color: "#10b981", fontFamily: "'Geist Mono',monospace" }}>{rp(o.total)}</b>
                </div>

                <div style={{ display: "flex", gap: 6 }}>
                  {o.status === "pending" && <button onClick={() => patch(o, { status: "preparing" })} style={Bact("#f59e0b")}>▶ Siapkan</button>}
                  {o.status === "preparing" && <button onClick={() => patch(o, { status: "delivered" })} style={Bact("#10b981")}>✓ Diantar</button>}
                  {o.status === "delivered" && <span style={{ flex: 1, textAlign: "center", color: C.sub, fontSize: 12 }}>✓ Sudah diantar{o.delivered_by ? ` oleh ${o.delivered_by}` : ""}</span>}
                  {(o.status === "pending" || o.status === "preparing") && <button onClick={() => patch(o, { status: "cancelled" })} style={Bact("#ef4444")}>× Batal</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {creating && (
        <div onClick={() => setCreating(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 12, padding: 20, width: 560, maxWidth: "94vw", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#a855f7", marginBottom: 14, fontFamily: "'Geist Mono',monospace" }}>+ ORDER MANUAL</div>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
                <CSField label="Kursi *">
                  <input style={modalInp} placeholder="A1, B5..." value={creating.seat} onChange={e => setCreating({ ...creating, seat: e.target.value })} />
                </CSField>
                <CSField label="Studio">
                  <select style={modalInp} value={creating.studio_id || ""} onChange={e => setCreating({ ...creating, studio_id: e.target.value })}>
                    <option value="">— pilih studio —</option>
                    {studios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </CSField>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <CSField label="Customer Name"><input style={modalInp} value={creating.buyer_name || ""} onChange={e => setCreating({ ...creating, buyer_name: e.target.value })} /></CSField>
                <CSField label="No. HP"><input style={modalInp} value={creating.buyer_phone || ""} onChange={e => setCreating({ ...creating, buyer_phone: e.target.value })} /></CSField>
              </div>
              <CSField label="Catatan"><input style={modalInp} value={creating.notes || ""} onChange={e => setCreating({ ...creating, notes: e.target.value })} /></CSField>
              <CSField label="Status Awal">
                <select style={modalInp} value={creating.status} onChange={e => setCreating({ ...creating, status: e.target.value })}>
                  <option value="pending">pending (baru)</option>
                  <option value="preparing">preparing (langsung disiapkan)</option>
                  <option value="delivered">delivered (sudah diantar)</option>
                </select>
              </CSField>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Geist Mono',monospace" }}>ITEMS *</div>
                  <button onClick={addItem} disabled={!menu.length} style={{ background: "#a855f71f", border: "1px solid #a855f755", color: "#a855f7", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: menu.length ? "pointer" : "not-allowed", opacity: menu.length ? 1 : 0.5, fontFamily: "inherit" }}>+ Item</button>
                </div>
                {(!creating.items || !creating.items.length) && <div style={{ fontSize: 11, color: C.dim, padding: "8px 0" }}>No item — klik "+ Item" untuk menambah.</div>}
                {(creating.items || []).map((it, i) => {
                  const m = menu.find(x => String(x.id) === String(it.bundle_id));
                  return (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 80px 90px 32px", gap: 8, alignItems: "center", marginBottom: 6 }}>
                      <select style={modalInp} value={it.bundle_id} onChange={e => updItem(i, { bundle_id: e.target.value })}>
                        {menu.map(b => <option key={b.id} value={b.id}>{b.name} — {rp(b.price)}</option>)}
                      </select>
                      <input type="number" min={1} style={modalInp} value={it.qty} onChange={e => updItem(i, { qty: e.target.value })} />
                      <div style={{ fontSize: 12, color: "#10b981", fontFamily: "'Geist Mono',monospace", textAlign: "right" }}>{m ? rp((Number(it.qty) || 1) * m.price) : "—"}</div>
                      <button onClick={() => rmItem(i)} style={{ background: "transparent", border: "1px solid #ef444444", color: "#ef4444", borderRadius: 6, padding: "4px 6px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>✕</button>
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => setCreating(null)} style={{ background: "transparent", border: "1px solid #30363d", color: "#9da7b3", borderRadius: 7, padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              <button onClick={submitCreate} style={{ background: "#a855f7", border: "none", color: "#fff", borderRadius: 7, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Tambah Order</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CSField({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Geist Mono',monospace", marginBottom: 4 }}>{label.toUpperCase()}</div>
      {children}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #1b212c", borderRadius: 10, padding: "6px 12px", textAlign: "center", minWidth: 76 }}>
      <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 17, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 0.5 }}>{label}</div>
    </div>
  );
}
const Bact = (color) => ({ background: color, border: "none", color: color === "#10b981" ? "#04130c" : "#111", padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", flex: 1, fontFamily: "inherit" });
