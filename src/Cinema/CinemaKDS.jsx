// karyaOS — Kitchen Display untuk Cinema (Concession Counter + In-Studio QR Order)
// Route: /?cinema-kds[&studio_id=X]
// Staff dapur/F&B liat antrian dari 2 sumber:
//   1. Concession (kiri): bundle yang dibeli sama tiket — diambil di counter
//   2. In-Studio (kanan): order via QR di kursi — diantar oleh runner ke seat
import { useState, useEffect, useCallback, useMemo } from "react";
import { HelpButton } from "../components/HelpModal.jsx";

const API_HOST = import.meta.env.VITE_API_URL || "http://localhost:3001";

const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const fmtTime = (sec) => sec ? new Date(sec * 1000).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "-";
const minsAgo = (sec) => {
  if (!sec) return 0;
  return Math.floor((Date.now() / 1000 - sec) / 60);
};

// Color by age — fresh: green, getting old: amber, stale: red
const ageColor = (mins) => {
  if (mins < 5) return "#10b981";
  if (mins < 15) return "#fbbf24";
  return "#ef4444";
};

export default function CinemaKDS() {
  const [data, setData] = useState({ concession: [], in_studio: [], counts: {} });
  const [loading, setLoading] = useState(true);
  const [studioFilter, setStudioFilter] = useState(() => {
    const s = new URLSearchParams(window.location.search).get("studio_id");
    return s ? parseInt(s, 10) : null;
  });
  const [studios, setStudios] = useState([]);
  const [tick, setTick] = useState(0); // force re-render tiap detik untuk age count

  const loadQueue = useCallback(async () => {
    try {
      const url = studioFilter
        ? `${API_HOST}/api/cinema/kds/queue?studio_id=${studioFilter}`
        : `${API_HOST}/api/cinema/kds/queue`;
      const r = await fetch(url);
      const d = await r.json();
      setData(d);
    } catch {}
    setLoading(false);
  }, [studioFilter]);

  useEffect(() => {
    loadQueue();
    const id = setInterval(loadQueue, 5000); // poll 5s
    return () => clearInterval(id);
  }, [loadQueue]);

  useEffect(() => {
    fetch(`${API_HOST}/api/cinema/studios`).then(r => r.json()).then(d => setStudios(d.studios || [])).catch(() => {});
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30 * 1000); // age tick 30s
    return () => clearInterval(id);
  }, []);

  // Full-screen layout — escape root cap
  useEffect(() => {
    const root = document.getElementById("root");
    if (root) { root.style.maxWidth = "none"; root.style.width = "100%"; root.style.padding = "0"; }
    document.documentElement.style.zoom = "1";
    return () => { if (root) { root.style.maxWidth = ""; root.style.width = ""; root.style.padding = ""; } };
  }, []);

  // Actions
  async function redeemConcession(id) {
    try {
      await fetch(`${API_HOST}/api/cinema/purchase-bundles/${id}/redeem`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ redeemed_by: "Counter staff" }),
      });
      loadQueue();
    } catch {}
  }
  async function updateInStudio(id, status) {
    try {
      await fetch(`${API_HOST}/api/cinema/in-studio/orders/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, delivered_by: status === "delivered" ? "Runner" : undefined }),
      });
      loadQueue();
    } catch {}
  }

  // Group concession by purchase_id (one purchase can have multiple bundles)
  const concessionGrouped = useMemo(() => {
    const groups = {};
    for (const c of data.concession || []) {
      const k = c.purchase_id || `id-${c.id}`;
      if (!groups[k]) groups[k] = { purchase_id: c.purchase_id, items: [], film_title: c.film_title, studio_name: c.studio_name, seat: c.seat, show_date: c.show_date, start_time: c.start_time, buyer: c.buyer, created_at: c.created_at };
      groups[k].items.push(c);
      // earliest created_at wins for age tracking
      if (c.created_at < groups[k].created_at) groups[k].created_at = c.created_at;
    }
    return Object.values(groups).sort((a, b) => a.created_at - b.created_at);
  }, [data.concession, tick]);

  return (
    <div style={{ minHeight: "100vh", background: BG, color: "#e6edf3", fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif", display: "flex", flexDirection: "column" }}>
      {/* Topbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 26px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(8,9,15,0.85)", backdropFilter: "blur(12px)", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg,#f59e0b,#a855f7)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>👨‍🍳</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.3 }}>Cinema Kitchen Display</div>
            <div style={{ fontSize: 10, fontFamily: "'Geist Mono',monospace", color: "#7d8590", letterSpacing: 1.5, textTransform: "uppercase" }}>karyaOS · F&B Station</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <select value={studioFilter || ""} onChange={(e) => setStudioFilter(e.target.value ? parseInt(e.target.value, 10) : null)}
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#e6edf3", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: "inherit", outline: "none" }}>
            <option value="">All Studios</option>
            {studios.map(s => <option key={s.id} value={s.id} style={{ background: "#0d1117" }}>{s.name}</option>)}
          </select>
          <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11, color: "#7d8590", fontFamily: "'Geist Mono',monospace", letterSpacing: 1 }}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 999, background: "#10b981", animation: "kdsPulse 1.4s ease-in-out infinite" }} />
            LIVE · 5s
          </div>
          <button onClick={loadQueue} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#e6edf3", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontFamily: "inherit", cursor: "pointer", fontWeight: 700 }}>↻ Refresh</button>
        </div>
      </div>
      <style>{`@keyframes kdsPulse { 0%,100% { opacity:0.4 } 50% { opacity:1 } }`}</style>

      {/* Stat strip */}
      <div style={{ display: "flex", gap: 8, padding: "10px 26px", background: "rgba(255,255,255,0.015)", borderBottom: "1px solid rgba(255,255,255,0.04)", overflowX: "auto" }}>
        <Stat label="ANTRIAN CONCESSION" value={data.counts?.concession_pending || 0} color="#f59e0b" />
        <Stat label="QR ORDER PENDING"   value={data.counts?.in_studio_pending || 0} color="#a855f7" />
        <Stat label="LAGI DISIAPKAN"     value={data.counts?.in_studio_preparing || 0} color="#22d3ee" />
      </div>

      {/* Two-column layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, flex: 1, minHeight: 0 }}>
        {/* LEFT: Concession Counter (F&B pickup) */}
        <div style={{ borderRight: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ padding: "14px 22px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "linear-gradient(180deg, rgba(245,158,11,0.08), transparent)" }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#fbbf24", letterSpacing: -0.2 }}>🍿 Concession Counter</div>
            <div style={{ fontSize: 11, color: "#7d8590", marginTop: 2 }}>Bundle dari tiket — customer ambil di counter sebelum film</div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
            {loading ? <Empty msg="⏳ Memuat..." /> :
             concessionGrouped.length === 0 ? <Empty msg="✓ Counter clear" /> :
             concessionGrouped.map((g, i) => <ConcessionCard key={g.purchase_id || i} group={g} onRedeem={redeemConcession} />)
            }
          </div>
        </div>

        {/* RIGHT: In-Studio QR Order (Runner delivery) */}
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ padding: "14px 22px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "linear-gradient(180deg, rgba(168,85,247,0.08), transparent)" }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#c084fc", letterSpacing: -0.2 }}>🎬 In-Studio QR Order</div>
            <div style={{ fontSize: 11, color: "#7d8590", marginTop: 2 }}>Customer scan QR di kursi — runner antar ke seat</div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
            {loading ? <Empty msg="⏳ Memuat..." /> :
             (data.in_studio || []).length === 0 ? <Empty msg="✓ Tidak ada order" /> :
             (data.in_studio || []).map(o => <InStudioCard key={o.id} order={o} onUpdate={updateInStudio} />)
            }
          </div>
        </div>
      </div>
      <HelpButton helpKey="cinema-kds" position="bottom-right" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
function Stat({ label, value, color }) {
  return (
    <div style={{ flex: 1, minWidth: 140, padding: "10px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10 }}>
      <div style={{ fontSize: 10, color: "#7d8590", fontFamily: "'Geist Mono',monospace", letterSpacing: 1.5, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color, fontFamily: "'Geist Mono',monospace", letterSpacing: -0.5, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function Empty({ msg }) {
  return <div style={{ padding: 40, textAlign: "center", color: "#5b6470", fontSize: 13 }}>{msg}</div>;
}

function ConcessionCard({ group, onRedeem }) {
  const mins = minsAgo(group.created_at);
  const c = ageColor(mins);
  return (
    <div style={{
      background: "rgba(255,255,255,0.025)", border: `1px solid ${c}33`, borderLeft: `3px solid ${c}`, borderRadius: 10,
      padding: 14, marginBottom: 10, boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#fff", letterSpacing: -0.2 }}>{group.film_title || "—"}</div>
          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2, fontFamily: "'Geist Mono',monospace" }}>
            {group.studio_name || "—"} · {group.show_date} {group.start_time}
          </div>
          {group.seat && <div style={{ fontSize: 11, color: "#fbbf24", marginTop: 2, fontFamily: "'Geist Mono',monospace" }}>Seat {group.seat}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: "#7d8590", fontFamily: "'Geist Mono',monospace", letterSpacing: 1 }}>{fmtTime(group.created_at)}</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: c, fontFamily: "'Geist Mono',monospace", marginTop: 1 }}>{mins}m</div>
        </div>
      </div>
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 8 }}>
        {group.items.map(it => (
          <div key={it.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", fontSize: 13, gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ color: "#fbbf24", fontWeight: 800, fontFamily: "'Geist Mono',monospace", marginRight: 8 }}>{it.qty}×</span>
              <span style={{ color: "#fff" }}>{it.bundle_name}</span>
            </div>
            <button onClick={() => onRedeem(it.id)} style={btnRedeem}>✓ AMBIL</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function InStudioCard({ order, onUpdate }) {
  const mins = minsAgo(order.created_at);
  const c = order.status === "preparing" ? "#22d3ee" : ageColor(mins);
  return (
    <div style={{
      background: "rgba(255,255,255,0.025)", border: `1px solid ${c}33`, borderLeft: `3px solid ${c}`, borderRadius: 10,
      padding: 14, marginBottom: 10, boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
            <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 4, fontFamily: "'Geist Mono',monospace", letterSpacing: 1, background: c + "22", color: c }}>{(order.status || "pending").toUpperCase()}</span>
            <span style={{ fontSize: 11, color: "#7d8590", fontFamily: "'Geist Mono',monospace", letterSpacing: 1 }}>{order.order_code}</span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>
            <span style={{ color: "#fbbf24", fontFamily: "'Geist Mono',monospace", letterSpacing: -0.3 }}>Seat {order.seat}</span>
            {order.studio_name && <span style={{ color: "#9ca3af", fontSize: 12, marginLeft: 8 }}>· {order.studio_name}</span>}
          </div>
          {order.buyer_name && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>👤 {order.buyer_name}{order.buyer_phone ? ` · ${order.buyer_phone}` : ""}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: "#7d8590", fontFamily: "'Geist Mono',monospace", letterSpacing: 1 }}>{fmtTime(order.created_at)}</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: c, fontFamily: "'Geist Mono',monospace", marginTop: 1 }}>{mins}m</div>
        </div>
      </div>
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 8 }}>
        {(order.items || []).map(it => (
          <div key={it.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
            <span><span style={{ color: "#fbbf24", fontWeight: 800, fontFamily: "'Geist Mono',monospace", marginRight: 8 }}>{it.qty}×</span><span style={{ color: "#fff" }}>{it.bundle_name}</span></span>
          </div>
        ))}
      </div>
      {order.notes && <div style={{ marginTop: 8, padding: "6px 10px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 6, fontSize: 11.5, color: "#fbbf24" }}>📝 {order.notes}</div>}
      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        {order.status === "pending" && (
          <button onClick={() => onUpdate(order.id, "preparing")} style={btnPrep}>🍳 Mulai Siapkan</button>
        )}
        {order.status === "preparing" && (
          <button onClick={() => onUpdate(order.id, "delivered")} style={btnDelivered}>🚶 Sudah Diantar</button>
        )}
        <button onClick={() => onUpdate(order.id, "cancelled")} style={btnCancel}>✕</button>
      </div>
    </div>
  );
}

const BG = "linear-gradient(160deg,#050810 0%,#0c0f1a 50%,#08090f 100%)";
const btnRedeem = {
  padding: "6px 14px", background: "linear-gradient(135deg,#10b981,#34d399)", border: "none", borderRadius: 7,
  color: "#062418", fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", letterSpacing: 0.5,
  boxShadow: "0 2px 6px rgba(16,185,129,0.3)",
};
const btnPrep = {
  flex: 1, padding: "9px 12px", background: "rgba(34,211,238,0.12)", border: "1px solid rgba(34,211,238,0.4)", borderRadius: 8,
  color: "#22d3ee", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
};
const btnDelivered = {
  flex: 1, padding: "9px 12px", background: "linear-gradient(135deg,#10b981,#34d399)", border: "none", borderRadius: 8,
  color: "#062418", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
  boxShadow: "0 2px 6px rgba(16,185,129,0.3)",
};
const btnCancel = {
  padding: "9px 12px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8,
  color: "#fca5a5", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
};
