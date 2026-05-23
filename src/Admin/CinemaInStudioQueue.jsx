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

export default function CinemaInStudioQueue({ apiBase = "" }) {
  const base = (apiBase || "") + "/api/cinema";
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState("active");  // active | all | delivered
  const [staff, setStaff] = useState(localStorage.getItem("cinema_fnb_staff") || "");

  const load = useCallback(async () => {
    const qs = filter === "active" ? "" : filter === "delivered" ? "?status=delivered" : "";
    const r = await fetch(`${base}/in-studio/orders${qs}`); const d = await r.json();
    let list = d.orders || [];
    if (filter === "active") list = list.filter(o => o.status === "pending" || o.status === "preparing");
    setOrders(list);
  }, [base, filter]);

  useEffect(() => {
    load();
    const iv = setInterval(load, 10000); // poll 10s
    return () => clearInterval(iv);
  }, [load]);

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
          <Stat label="Baru" value={counts.pending || 0} color={STATUS.pending.color} />
          <Stat label="Disiapkan" value={counts.preparing || 0} color={STATUS.preparing.color} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {[["active", "Aktif"], ["all", "Semua"], ["delivered", "Diantar"]].map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)}
            style={{ background: filter === id ? "#a855f72a" : "transparent", border: `1px solid ${filter === id ? "#a855f766" : C.border}`, borderRadius: 8, padding: "7px 14px", color: filter === id ? "#fff" : C.sub, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{label}</button>
        ))}
      </div>

      {orders.length === 0 ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "30px 18px", textAlign: "center", color: C.sub, fontSize: 13 }}>
          Tidak ada pesanan.
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
