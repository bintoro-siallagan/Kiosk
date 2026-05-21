/**
 * AdminTools.jsx — Staff, Gudang, Waste, Config, Audit Trail
 * Route: scene "tools" from Admin sidebar
 */
import { useState, useEffect, useCallback } from "react";
import AdminMenuBuilder from "./Admin/AdminMenuBuilder.jsx";
import AdminProcurementGaps from "./Admin/AdminProcurementGaps.jsx";
import AdminAggregator from "./Admin/AdminAggregator.jsx";
import AdminPaymentGateway from "./Admin/AdminPaymentGateway.jsx";
import AdminLoyalty from "./Admin/AdminLoyalty.jsx";
import AdminCashierKPI from "./Admin/AdminCashierKPI.jsx";
import AdminChecklist from "./Admin/AdminChecklist.jsx";
import AdminHRIS from "./Admin/AdminHRIS.jsx";
import AdminBroadcast from "./Admin/AdminBroadcast.jsx";
import AdminPriceList from "./Admin/AdminPriceList.jsx";
import { requireManagerPin } from "./components/ManagerPinGate.jsx";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";
const TOKEN = () => localStorage.getItem("adminToken") || "";
const hdr = () => ({ "Content-Type": "application/json", "Authorization": `Bearer ${TOKEN()}` });
const fR = n => "Rp " + Math.round(n || 0).toLocaleString("id-ID");

async function api(path, opts = {}) {
  const r = await fetch(`${API}${path}`, { headers: hdr(), ...opts });
  return r.json();
}
async function apiPost(path, body) {
  return api(path, { method: "POST", body: JSON.stringify(body) });
}
async function apiPatch(path, body) {
  return api(path, { method: "PATCH", body: JSON.stringify(body) });
}

// ── Styles ──
const S = {
  root: { fontFamily: "'Plus Jakarta Sans',sans-serif", background: "#050810", color: "#fff", minHeight: "100vh", display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, right: 0, bottom: 0, overflowY: "auto", zIndex: 9999 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 28px 0" },
  title: { fontFamily: "'Space Mono',monospace", fontSize: 20, fontWeight: 700, letterSpacing: 2 },
  sub: { fontSize: 12, color: "#555", marginTop: 2 },
  tabs: { display: "flex", gap: 4, padding: "16px 28px 0", borderBottom: "1px solid #0f1629", overflowX: "auto" },
  tab: (active, color) => ({
    padding: "10px 18px", fontSize: 13, fontWeight: active ? 700 : 400,
    color: active ? color : "#555", background: "transparent", border: "none",
    borderBottom: active ? `3px solid ${color}` : "3px solid transparent",
    cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
  }),
  body: { flex: 1, padding: "20px 28px", overflowY: "auto" },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 14, padding: 20, marginBottom: 16 },
  label: { fontSize: 11, color: "#555", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8, fontFamily: "'Space Mono',monospace" },
  input: { width: "100%", background: "#0a0e16", border: "1px solid #21262d", borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" },
  btn: (color = "#F59E0B") => {
    // normalize 3-digit hex → 6-digit, biar +"18"/"44" alpha valid (bukan #55518)
    const c = color.length === 4 ? "#" + color.slice(1).split("").map(x => x + x).join("") : color;
    return {
      background: c + "18", border: `1px solid ${c}44`, borderRadius: 8,
      padding: "10px 18px", color: c, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
    };
  },
  btnDanger: { background: "#F8717118", border: "1px solid #F8717144", borderRadius: 8, padding: "8px 14px", color: "#F87171", fontSize: 12, cursor: "pointer", fontFamily: "inherit" },
  row: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #0f1629" },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 },
  badge: (color) => ({ background: color + "22", color, padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600 }),
  toast: { position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#34D39915", border: "1px solid #34D39944", color: "#34D399", borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 600, zIndex: 9999 },
  bar: (pct, color) => ({ height: 6, background: "#161b22", borderRadius: 3, overflow: "hidden", flex: 1, children: null }),
};

export default function AdminTools({ onBack, initialTab }) {
  const [tab, setTab] = useState(initialTab || "staff");
  const [toast, setToast] = useState(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  const TABS = [
    { id: "staff", label: "👤 Staff & PIN", color: "#F59E0B" },
    { id: "gudang", label: "📦 Gudang & Stok", color: "#3B82F6" },
    { id: "waste", label: "🗑️ Log Waste", color: "#F97316" },
    { id: "config", label: "⚙️ Konfigurasi", color: "#A78BFA" },
    { id: "audit", label: "📋 Audit Trail", color: "#14B8A6" },
    { id: "master", label: "🍽️ Master Item", color: "#EC4899" },
    { id: "finance", label: "💰 Finance", color: "#10B981" },
    { id: "menu_builder", label: "🧱 Menu Builder", color: "#8B5CF6" },
    { id: "procurement_plus", label: "🚚 Procurement+", color: "#06B6D4" },
    { id: "aggregator", label: "🛵 Aggregator", color: "#FB7185" },
    { id: "payment", label: "💳 Payment Gateway", color: "#22D3EE" },
    { id: "loyalty", label: "🏅 Loyalty", color: "#FBBF24" },
    { id: "cashier_kpi", label: "📊 KPI Kasir", color: "#34D399" },
    { id: "checklist", label: "✅ Checklist", color: "#10B981" },
    { id: "hris", label: "👥 HRIS", color: "#A78BFA" },
    { id: "broadcast", label: "📣 Broadcast", color: "#f97316" },
    { id: "price_list", label: "💲 Price List", color: "#10b981" },
  ];

  return (
    <div style={S.root}>
      <div style={S.header}>
        <div>
          <div style={S.title}>🛠️ ADMIN TOOLS</div>
          <div style={S.sub}>Staff · Gudang · Waste · Config · Audit</div>
        </div>
        <button onClick={onBack} style={S.btn()}>← Kembali</button>
      </div>

      <div style={S.tabs}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={S.tab(tab === t.id, t.color)}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={S.body}>
        {tab === "staff" && <StaffTab showToast={showToast} />}
        {tab === "gudang" && <GudangTab showToast={showToast} />}
        {tab === "waste" && <WasteTab showToast={showToast} />}
        {tab === "config" && <ConfigTab showToast={showToast} />}
        {tab === "audit" && <AuditTab />}
        {tab === "master" && <MasterItemTab showToast={showToast} />}
        {tab === "finance" && <FinanceTab showToast={showToast} />}
        {tab === "menu_builder" && <AdminMenuBuilder />}
        {tab === "procurement_plus" && <AdminProcurementGaps />}
        {tab === "aggregator" && <AdminAggregator apiBase={API} />}
        {tab === "payment" && <AdminPaymentGateway apiBase={API} />}
        {tab === "loyalty" && <AdminLoyalty apiBase={API} />}
        {tab === "cashier_kpi" && <AdminCashierKPI apiBase={API} />}
        {tab === "checklist" && <AdminChecklist apiBase={API} />}
        {tab === "hris" && <AdminHRIS apiBase={API} />}
        {tab === "broadcast" && <AdminBroadcast apiBase={API} />}
        {tab === "price_list" && <AdminPriceList apiBase={API} />}
      </div>

      {toast && <div style={S.toast}>{toast}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// STAFF TAB
// ═══════════════════════════════════════════════════════════════════
function StaffTab({ showToast }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", pin: "", role: "kasir" });
  const [editId, setEditId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await api("/api/auth/users");
    setUsers(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async () => {
    if (!form.name || !form.pin) return;
    if (editId) {
      await apiPatch(`/api/auth/users/${editId}`, form);
      showToast(`✓ ${form.name} updated`);
    } else {
      await apiPost("/api/auth/users", form);
      showToast(`✓ ${form.name} added`);
    }
    setForm({ name: "", pin: "", role: "kasir" });
    setEditId(null);
    load();
  };

  const handleEdit = (u) => {
    setEditId(u.id);
    setForm({ name: u.name, pin: u.pin || "", role: u.role });
  };

  return (
    <div>
      <div style={S.card}>
        <div style={S.label}>{editId ? "Edit Staff" : "Tambah Staff Baru"}</div>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 2, minWidth: 150 }}>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Nama</div>
            <input style={S.input} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nama staff..." />
          </div>
          <div style={{ flex: 1, minWidth: 100 }}>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>PIN (6 digit)</div>
            <input style={S.input} type="password" value={form.pin} onChange={e => setForm(f => ({ ...f, pin: e.target.value }))} placeholder="••••••" maxLength={6} />
          </div>
          <div style={{ flex: 1, minWidth: 100 }}>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Role</div>
            <select style={{ ...S.input, cursor: "pointer" }} value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              <option value="kasir">Kasir</option>
              <option value="manager">Manager</option>
            </select>
          </div>
          <button onClick={handleSubmit} style={S.btn()}>{editId ? "💾 Update" : "➕ Tambah"}</button>
          {editId && <button onClick={() => { setEditId(null); setForm({ name: "", pin: "", role: "kasir" }); }} style={S.btnDanger}>Batal</button>}
        </div>
      </div>

      <div style={S.card}>
        <div style={S.label}>Daftar Staff ({users.length})</div>
        {loading ? <div style={{ color: "#555" }}>Loading...</div> :
          users.map((u, i) => (
            <div key={u.id || i} style={S.row}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: u.role === "manager" ? "#F59E0B22" : "#3B82F622", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
                  {u.role === "manager" ? "👑" : "👤"}
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{u.name}</div>
                  <div style={{ fontSize: 11, color: "#555" }}>PIN: {u.pin} · <span style={S.badge(u.role === "manager" ? "#F59E0B" : "#3B82F6")}>{u.role}</span></div>
                </div>
              </div>
              <button onClick={() => handleEdit(u)} style={S.btn("#3B82F6")}>✏️ Edit</button>
            </div>
          ))
        }
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// GUDANG TAB
// ═══════════════════════════════════════════════════════════════════
function GudangTab({ showToast }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [restockId, setRestockId] = useState(null);
  const [restockQty, setRestockQty] = useState("");
  const [opnameMode, setOpnameMode] = useState(false);
  const [opnameData, setOpnameData] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    const data = await api("/api/audit/warehouse");
    setItems(data?.items || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRestock = async (id) => {
    if (!restockQty || restockQty <= 0) return;
    await apiPost(`/api/audit/warehouse/${id}/restock`, { quantity: Number(restockQty) });
    showToast("✓ Stok ditambahkan");
    setRestockId(null);
    setRestockQty("");
    load();
  };

  const handleOpname = async () => {
    const batch = Object.entries(opnameData).map(([id, val]) => ({ id, actualStock: Number(val) })).filter(x => !isNaN(x.actualStock));
    if (batch.length === 0) return;
    const res = await apiPost("/api/audit/warehouse/stock-take", { items: batch });
    showToast(`✓ Stock opname selesai — ${res.mismatches || 0} selisih`);
    setOpnameMode(false);
    setOpnameData({});
    load();
  };

  const critical = items.filter(i => i.stock <= i.minStock);
  const byCategory = {};
  items.forEach(i => {
    const cat = i.category || "other";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(i);
  });
  const catLabels = { bahan: "🥛 Bahan Baku", packaging: "📦 Packaging", topping: "🍬 Topping", other: "📋 Lainnya" };

  return (
    <div>
      {/* KPIs */}
      <div style={{ ...S.grid3, marginBottom: 16 }}>
        <div style={{ ...S.card, borderLeft: "4px solid #3B82F6", marginBottom: 0 }}>
          <div style={S.label}>Total SKU</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#3B82F6", fontFamily: "'Space Mono',monospace" }}>{items.length}</div>
        </div>
        <div style={{ ...S.card, borderLeft: "4px solid #EF4444", marginBottom: 0 }}>
          <div style={S.label}>Kritis</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#EF4444", fontFamily: "'Space Mono',monospace" }}>{critical.length}</div>
        </div>
        <div style={{ ...S.card, borderLeft: "4px solid #10B981", marginBottom: 0 }}>
          <div style={S.label}>Aman</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#10B981", fontFamily: "'Space Mono',monospace" }}>{items.length - critical.length}</div>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <button onClick={() => setOpnameMode(!opnameMode)} style={S.btn(opnameMode ? "#EF4444" : "#A78BFA")}>
          {opnameMode ? "❌ Batal Opname" : "📋 Stock Opname"}
        </button>
        {opnameMode && <button onClick={handleOpname} style={S.btn("#10B981")}>💾 Simpan Opname</button>}
        <button onClick={load} style={S.btn("#555")}>🔄 Refresh</button>
      </div>

      {/* Critical alerts */}
      {critical.length > 0 && (
        <div style={{ ...S.card, borderLeft: "4px solid #EF4444", background: "#1a0a0a" }}>
          <div style={{ ...S.label, color: "#FCA5A5" }}>⚠ STOK KRITIS — REORDER SEKARANG</div>
          {critical.map(w => {
            const dl = w.dailyUse > 0 ? Math.floor(w.stock / w.dailyUse) : 999;
            return (
              <div key={w.id} style={S.row}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#FCA5A5" }}>{w.name}</div>
                  <div style={{ fontSize: 11, color: "#666" }}>{w.id} · use {w.dailyUse}/{w.unit}/day</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={{ fontSize: 18, fontWeight: 700, color: "#EF4444", fontFamily: "'Space Mono',monospace" }}>{Math.round(w.stock * 10) / 10}</span>
                  <span style={{ fontSize: 12, color: "#888" }}> {w.unit}</span>
                  <div style={{ fontSize: 11, color: dl <= 2 ? "#EF4444" : "#F59E0B" }}>{dl} hari lagi</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Inventory by category */}
      {Object.entries(byCategory).map(([cat, catItems]) => (
        <div key={cat} style={S.card}>
          <div style={S.label}>{catLabels[cat] || cat}</div>
          {catItems.map(w => {
            const pct = w.maxStock > 0 ? w.stock / w.maxStock * 100 : 0;
            const low = w.stock <= w.minStock;
            const dl = w.dailyUse > 0 ? Math.floor(w.stock / w.dailyUse) : 999;
            return (
              <div key={w.id} style={{ ...S.row, flexWrap: "wrap", gap: 8 }}>
                <div style={{ flex: 2, minWidth: 150 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: low ? "#FCA5A5" : "#ddd" }}>{w.name}</div>
                  <div style={{ height: 6, background: "#161b22", borderRadius: 3, overflow: "hidden", marginTop: 4 }}>
                    <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: low ? "#EF4444" : pct > 60 ? "#10B981" : "#EAB308", borderRadius: 3 }} />
                  </div>
                </div>
                <div style={{ minWidth: 80, textAlign: "right" }}>
                  {opnameMode ? (
                    <input
                      style={{ ...S.input, width: 70, padding: "6px 8px", fontSize: 13, textAlign: "right" }}
                      type="number" placeholder={String(w.stock)}
                      value={opnameData[w.id] || ""}
                      onChange={e => setOpnameData(d => ({ ...d, [w.id]: e.target.value }))}
                    />
                  ) : (
                    <span style={{ fontSize: 16, fontWeight: 700, fontFamily: "'Space Mono',monospace", color: low ? "#EF4444" : "#ddd" }}>
                      {Math.round(w.stock * 10) / 10} <span style={{ fontSize: 11, color: "#666" }}>{w.unit}</span>
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: dl <= 3 ? "#EF4444" : dl <= 7 ? "#F59E0B" : "#555", minWidth: 40, textAlign: "right" }}>{dl}d</div>
                {!opnameMode && (
                  restockId === w.id ? (
                    <div style={{ display: "flex", gap: 6 }}>
                      <input style={{ ...S.input, width: 60, padding: "6px 8px" }} type="number" value={restockQty} onChange={e => setRestockQty(e.target.value)} placeholder="qty" />
                      <button onClick={() => handleRestock(w.id)} style={S.btn("#10B981")}>✓</button>
                      <button onClick={() => setRestockId(null)} style={S.btnDanger}>✗</button>
                    </div>
                  ) : (
                    <button onClick={() => { setRestockId(w.id); setRestockQty(""); }} style={S.btn("#3B82F6")}>+ Restock</button>
                  )
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// WASTE TAB
// ═══════════════════════════════════════════════════════════════════
function WasteTab({ showToast }) {
  const [history, setHistory] = useState([]);
  const [form, setForm] = useState({ itemName: "", quantity: "", unit: "pcs", reason: "" });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await api("/api/audit/waste");
    setHistory(data?.items || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async () => {
    if (!form.itemName || !form.quantity) return;
    await apiPost("/api/audit/waste", {
      ...form,
      quantity: Number(form.quantity),
      cashierName: localStorage.getItem("adminName") || "Unknown",
    });
    showToast("✓ Waste logged");
    setForm({ itemName: "", quantity: "", unit: "pcs", reason: "" });
    load();
  };

  const quickItems = ["Black Sakura Reg", "White Skim Reg", "Lykone", "Strawberry Smooth", "Mango Smooth", "Yogulato Vanilla", "Cup 12oz", "Cup 16oz", "Lid Dome"];

  return (
    <div>
      <div style={S.card}>
        <div style={S.label}>Log Waste Baru</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {quickItems.map(item => (
            <button key={item} onClick={() => setForm(f => ({ ...f, itemName: item }))}
              style={{ ...S.btn(form.itemName === item ? "#F59E0B" : "#555"), fontSize: 11, padding: "6px 10px" }}>
              {item}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 2, minWidth: 150 }}>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Item</div>
            <input style={S.input} value={form.itemName} onChange={e => setForm(f => ({ ...f, itemName: e.target.value }))} placeholder="Nama item..." />
          </div>
          <div style={{ flex: 1, minWidth: 80 }}>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Jumlah</div>
            <input style={S.input} type="number" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} placeholder="0" />
          </div>
          <div style={{ flex: 1, minWidth: 80 }}>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Unit</div>
            <select style={{ ...S.input, cursor: "pointer" }} value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
              <option value="pcs">pcs</option>
              <option value="cup">cup</option>
              <option value="kg">kg</option>
              <option value="liter">liter</option>
            </select>
          </div>
          <div style={{ flex: 2, minWidth: 150 }}>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Alasan</div>
            <input style={S.input} value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="Salah bikin, expired, dll..." />
          </div>
          <button onClick={handleSubmit} style={S.btn("#F97316")}>🗑️ Log Waste</button>
        </div>
      </div>

      <div style={S.card}>
        <div style={S.label}>Riwayat Waste ({history.length})</div>
        {loading ? <div style={{ color: "#555" }}>Loading...</div> :
          history.length === 0 ? <div style={{ color: "#555", padding: 12 }}>Belum ada waste tercatat</div> :
            history.map((w, i) => (
              <div key={w.id || i} style={S.row}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#F97316" }}>{w.item_name}</div>
                  <div style={{ fontSize: 11, color: "#555" }}>{w.reason || "—"} · {w.cashier_name || "?"}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: "#F97316", fontFamily: "'Space Mono',monospace" }}>{w.quantity}</span>
                  <span style={{ fontSize: 12, color: "#666" }}> {w.unit}</span>
                  <div style={{ fontSize: 10, color: "#444" }}>{new Date(w.created_at).toLocaleString("id-ID")}</div>
                </div>
              </div>
            ))
        }
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CONFIG TAB
// ═══════════════════════════════════════════════════════════════════
function ConfigTab({ showToast }) {
  const [configs, setConfigs] = useState([]);
  const [edits, setEdits] = useState({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await api("/api/audit/config");
    setConfigs(data?.items || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (key) => {
    if (edits[key] === undefined) return;
    await apiPatch(`/api/config/${key}`, { value: edits[key] });
    showToast(`✓ ${key} updated`);
    setEdits(e => { const n = { ...e }; delete n[key]; return n; });
    load();
  };

  const handleSaveAll = async () => {
    if (Object.keys(edits).length === 0) return;
    await apiPost("/api/audit/config/batch", { configs: edits });
    showToast(`✓ ${Object.keys(edits).length} config updated`);
    setEdits({});
    load();
  };

  const descriptions = {
    POINT_VALUE: "Nilai 1 poin dalam Rupiah. Default: 100 (1 poin = Rp 100)",
    MANAGER_WA: "Nomor WA manager untuk auto-report shift close (format: 628xxx)",
    OWNER_WA: "Nomor WA owner/BOD (format: 628xxx)",
    AUTO_REPORT_ENABLED: "Auto kirim WA report saat shift ditutup (true/false)",
  };

  return (
    <div>
      {Object.keys(edits).length > 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <button onClick={handleSaveAll} style={S.btn("#10B981")}>💾 Simpan Semua ({Object.keys(edits).length} perubahan)</button>
        </div>
      )}

      <div style={S.card}>
        <div style={S.label}>Konfigurasi Sistem</div>
        {loading ? <div style={{ color: "#555" }}>Loading...</div> :
          configs.map((c, i) => {
            const isEdited = edits[c.key] !== undefined;
            const currentVal = isEdited ? edits[c.key] : c.value;
            return (
              <div key={c.key} style={{ ...S.row, flexWrap: "wrap", gap: 8 }}>
                <div style={{ flex: 2, minWidth: 200 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#F59E0B", fontFamily: "'Space Mono',monospace" }}>{c.key}</div>
                  <div style={{ fontSize: 11, color: "#555" }}>{descriptions[c.key] || ""}</div>
                  {c.updated_at && <div style={{ fontSize: 10, color: "#333" }}>Updated: {new Date(c.updated_at).toLocaleString("id-ID")}</div>}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    style={{ ...S.input, width: 200, padding: "8px 10px" }}
                    value={currentVal}
                    onChange={e => setEdits(ed => ({ ...ed, [c.key]: e.target.value }))}
                  />
                  {isEdited && <button onClick={() => handleSave(c.key)} style={S.btn("#10B981")}>💾</button>}
                </div>
              </div>
            );
          })
        }
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// AUDIT TRAIL TAB
// ═══════════════════════════════════════════════════════════════════
function AuditTab() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [limit, setLimit] = useState(50);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit });
    if (filter) params.set("type", filter);
    const data = await api(`/api/audit/events?${params}`);
    setEvents(data?.items || []);
    setLoading(false);
  }, [filter, limit]);

  useEffect(() => { load(); }, [load]);

  const eventTypes = [...new Set(events.map(e => e.event_type))].sort();

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={() => setFilter("")} style={S.btn(!filter ? "#F59E0B" : "#555")}>Semua</button>
        {eventTypes.map(t => (
          <button key={t} onClick={() => setFilter(t)} style={S.btn(filter === t ? "#14B8A6" : "#555")}>{t}</button>
        ))}
        <select style={{ ...S.input, width: 80 }} value={limit} onChange={e => setLimit(Number(e.target.value))}>
          <option value={20}>20</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
        <button onClick={load} style={S.btn("#555")}>🔄</button>
      </div>

      <div style={S.card}>
        <div style={S.label}>Event Log ({events.length})</div>
        {loading ? <div style={{ color: "#555" }}>Loading...</div> :
          events.length === 0 ? <div style={{ color: "#555", padding: 12 }}>Belum ada event</div> :
            events.map((e, i) => {
              let parsed = {};
              try { parsed = JSON.parse(e.data); } catch (err) {}
              return (
                <div key={e.id || i} style={{ ...S.row, flexDirection: "column", alignItems: "stretch", gap: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={S.badge(e.event_type?.includes("void") ? "#EF4444" : "#14B8A6")}>{e.event_type}</span>
                      {e.cashier_name && <span style={{ fontSize: 12, color: "#888" }}>{e.cashier_name}</span>}
                      {e.order_id && <span style={{ fontSize: 11, color: "#555", fontFamily: "'Space Mono',monospace" }}>{e.order_id}</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "#444" }}>{new Date(e.created_at).toLocaleString("id-ID")}</div>
                  </div>
                  {e.amount > 0 && <div style={{ fontSize: 13, color: "#F59E0B", fontFamily: "'Space Mono',monospace" }}>{fR(e.amount)}</div>}
                  {parsed.reason && <div style={{ fontSize: 11, color: "#888" }}>Reason: {parsed.reason}</div>}
                  {parsed.approvedBy && <div style={{ fontSize: 11, color: "#10B981" }}>Approved: {parsed.approvedBy}</div>}
                </div>
              );
            })
        }
      </div>
    </div>
  );
}


// ═══ MASTER ITEM TAB ═══
function MasterItemTab({ showToast }) {
  const [items, setItems] = useState([]);
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ cat:"froyo", emoji:"🍦", name:"", desc:"", price:"", freeToppings:"0" });
  const [editId, setEditId] = useState(null);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [m, c] = await Promise.all([api("/api/menu"), api("/api/categories")]);
    setItems(Array.isArray(m) ? m : []);
    setCats(Array.isArray(c) ? c : []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleSubmit = async () => {
    if (!form.name || !form.price) return;
    const body = { ...form, price: Number(form.price), freeToppings: Number(form.freeToppings) };
    if (editId) {
      const auth = await requireManagerPin({
        title: `Ubah Menu "${form.name}"`,
        message: `Perubahan data menu master — harga baru Rp ${Number(form.price).toLocaleString('id-ID')}.`,
      });
      if (!auth.ok) return;
      await api("/api/menu/" + editId, { method: "PUT", body: JSON.stringify(body) });
      showToast("Item updated");
    } else {
      await apiPost("/api/menu", body);
      showToast(form.name + " ditambahkan");
    }
    setForm({ cat:"froyo", emoji:"🍦", name:"", desc:"", price:"", freeToppings:"0" });
    setEditId(null);
    load();
  };

  const handleEdit = (item) => {
    setEditId(item.id);
    setForm({ cat:item.cat, emoji:item.emoji, name:item.name, desc:item.desc||"", price:String(item.price), freeToppings:String(item.freeToppings||0) });
  };

  const handleDelete = async (id, name) => {
    const auth = await requireManagerPin({
      title: `Hapus Menu "${name}"`,
      message: `Item master "${name}" akan dihapus permanen dari menu.`,
      requireReason: true,
    });
    if (!auth.ok) return;
    await api("/api/menu/" + id, { method: "DELETE" });
    showToast(name + " dihapus");
    load();
  };

  const handleToggle = async (item) => {
    await apiPatch("/api/menu/" + item.id, { avail: !item.avail });
    showToast(item.name + (item.avail ? " OFF" : " ON"));
    load();
  };

  const filtered = filter ? items.filter(i => i.cat === filter) : items;
  const grouped = {};
  filtered.forEach(i => { if (!grouped[i.cat]) grouped[i.cat] = []; grouped[i.cat].push(i); });

  return (
    <div>
      <div style={S.card}>
        <div style={S.label}>{editId ? "Edit Item" : "Tambah Item Baru"}</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 2fr",gap:10,marginBottom:10}}>
          <div>
            <div style={{fontSize:11,color:"#666",marginBottom:4}}>Kategori</div>
            <select style={{...S.input,cursor:"pointer"}} value={form.cat} onChange={e=>setForm(f=>({...f,cat:e.target.value}))}>
              {cats.map(c=><option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
            </select>
          </div>
          <div>
            <div style={{fontSize:11,color:"#666",marginBottom:4}}>Emoji</div>
            <input style={S.input} value={form.emoji} onChange={e=>setForm(f=>({...f,emoji:e.target.value}))} placeholder="🍦"/>
          </div>
          <div>
            <div style={{fontSize:11,color:"#666",marginBottom:4}}>Nama Produk</div>
            <input style={S.input} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Nama item..."/>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:10}}>
          <div>
            <div style={{fontSize:11,color:"#666",marginBottom:4}}>Deskripsi</div>
            <input style={S.input} value={form.desc} onChange={e=>setForm(f=>({...f,desc:e.target.value}))} placeholder="Deskripsi..."/>
          </div>
          <div>
            <div style={{fontSize:11,color:"#666",marginBottom:4}}>Harga (Rp)</div>
            <input style={S.input} type="number" value={form.price} onChange={e=>setForm(f=>({...f,price:e.target.value}))} placeholder="50000"/>
          </div>
          <div>
            <div style={{fontSize:11,color:"#666",marginBottom:4}}>Free Topping</div>
            <input style={S.input} type="number" value={form.freeToppings} onChange={e=>setForm(f=>({...f,freeToppings:e.target.value}))} placeholder="0"/>
          </div>
          <div style={{display:"flex",alignItems:"flex-end",gap:6}}>
            <button onClick={handleSubmit} style={S.btn("#EC4899")}>{editId?"Update":"+ Tambah"}</button>
            {editId&&<button onClick={()=>{setEditId(null);setForm({cat:"froyo",emoji:"🍦",name:"",desc:"",price:"",freeToppings:"0"});}} style={S.btnDanger}>X</button>}
          </div>
        </div>
      </div>

      <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
        <button onClick={()=>setFilter("")} style={S.btn(!filter?"#EC4899":"#8b8b95")}>Semua ({items.length})</button>
        {cats.map(c=><button key={c.id} onClick={()=>setFilter(c.id)} style={S.btn(filter===c.id?"#EC4899":"#8b8b95")}>{c.emoji} {c.name}</button>)}
      </div>

      {loading?<div style={{color:"#555"}}>Loading...</div>:
        Object.entries(grouped).map(([cat,catItems])=>{
          const ci=cats.find(c=>c.id===cat)||{name:cat,emoji:"📋"};
          return(
            <div key={cat} style={S.card}>
              <div style={S.label}>{ci.emoji} {ci.name} ({catItems.length})</div>
              {catItems.map(item=>(
                <div key={item.id} style={{...S.row,opacity:item.avail?1:0.5,gap:8,flexWrap:"wrap"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,flex:2,minWidth:180}}>
                    <span style={{fontSize:22}}>{item.emoji}</span>
                    <div>
                      <div style={{fontSize:14,fontWeight:600}}>{item.name}</div>
                      <div style={{fontSize:11,color:"#555"}}>#{item.id} · {item.desc}</div>
                    </div>
                  </div>
                  <span style={{fontSize:15,fontWeight:700,color:"#F59E0B",fontFamily:"'Space Mono',monospace",minWidth:90}}>{fR(item.price)}</span>
                  <span style={S.badge(item.avail?"#34D399":"#F87171")}>{item.avail?"Aktif":"Off"}</span>
                  {item.freeToppings>0&&<span style={{fontSize:11,color:"#888"}}>+{item.freeToppings} topping</span>}
                  <div style={{display:"flex",gap:4}}>
                    <button onClick={()=>handleToggle(item)} style={S.btn(item.avail?"#F87171":"#34D399")}>{item.avail?"Off":"On"}</button>
                    <button onClick={()=>handleEdit(item)} style={S.btn("#3B82F6")}>Edit</button>
                    <button onClick={()=>handleDelete(item.id,item.name)} style={S.btnDanger}>Hapus</button>
                  </div>
                </div>
              ))}
            </div>
          );
        })
      }
    </div>
  );
}

// ═══ FINANCE TAB ═══
function FinanceTab({ showToast }) {
  const [pnl, setPnl] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ category:"Bahan Baku", description:"", amount:"" });
  const expCats = ["Bahan Baku","Packaging","Gaji","Sewa","Listrik & Air","Marketing","Maintenance","Lainnya"];

  const load = useCallback(async () => {
    setLoading(true);
    const [p, e] = await Promise.all([api("/api/finance/pnl"), api("/api/finance/expenses")]);
    setPnl(p);
    setExpenses(e?.items || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleSubmit = async () => {
    if (!form.amount) return;
    await apiPost("/api/finance/expenses", { ...form, amount: Number(form.amount) });
    showToast("Expense logged");
    setForm({ category:"Bahan Baku", description:"", amount:"" });
    load();
  };

  return (
    <div>
      {pnl&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:12,marginBottom:16}}>
          <div style={{...S.card,borderLeft:"4px solid #10B981",marginBottom:0}}>
            <div style={S.label}>Revenue</div>
            <div style={{fontSize:24,fontWeight:700,color:"#10B981",fontFamily:"'Space Mono',monospace"}}>{fR(pnl.revenue?.gross||0)}</div>
            <div style={{fontSize:11,color:"#555"}}>{pnl.revenue?.orders||0} orders</div>
          </div>
          <div style={{...S.card,borderLeft:"4px solid #F59E0B",marginBottom:0}}>
            <div style={S.label}>PPN 11%</div>
            <div style={{fontSize:24,fontWeight:700,color:"#F59E0B",fontFamily:"'Space Mono',monospace"}}>{fR(pnl.revenue?.tax||0)}</div>
          </div>
          <div style={{...S.card,borderLeft:"4px solid #EF4444",marginBottom:0}}>
            <div style={S.label}>Expenses</div>
            <div style={{fontSize:24,fontWeight:700,color:"#EF4444",fontFamily:"'Space Mono',monospace"}}>{fR(pnl.expenses?.total||0)}</div>
          </div>
          <div style={{...S.card,borderLeft:"4px solid "+((pnl.profit?.net||0)>=0?"#10B981":"#EF4444"),marginBottom:0}}>
            <div style={S.label}>Net Profit</div>
            <div style={{fontSize:24,fontWeight:700,color:(pnl.profit?.net||0)>=0?"#10B981":"#EF4444",fontFamily:"'Space Mono',monospace"}}>{fR(pnl.profit?.net||0)}</div>
            <div style={{fontSize:11,color:"#555"}}>Margin {pnl.profit?.margin||0}%</div>
          </div>
        </div>
      )}

      <div style={S.card}>
        <div style={S.label}>+ Input Expense</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 2fr 1fr auto",gap:10,alignItems:"flex-end"}}>
          <div>
            <div style={{fontSize:11,color:"#666",marginBottom:4}}>Kategori</div>
            <select style={{...S.input,cursor:"pointer"}} value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>
              {expCats.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <div style={{fontSize:11,color:"#666",marginBottom:4}}>Deskripsi</div>
            <input style={S.input} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="Beli yogurt base 5kg..."/>
          </div>
          <div>
            <div style={{fontSize:11,color:"#666",marginBottom:4}}>Amount (Rp)</div>
            <input style={S.input} type="number" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} placeholder="250000"/>
          </div>
          <button onClick={handleSubmit} style={S.btn("#10B981")}>Simpan</button>
        </div>
      </div>

      <div style={S.card}>
        <div style={S.label}>Riwayat Expense ({expenses.length})</div>
        {loading?<div style={{color:"#555"}}>Loading...</div>:
          expenses.length===0?<div style={{color:"#555",padding:12}}>Belum ada expense</div>:
            expenses.map((e,i)=>(
              <div key={e.id||i} style={S.row}>
                <div>
                  <div style={{fontSize:14,fontWeight:600,color:"#EF4444"}}>{e.category}</div>
                  <div style={{fontSize:11,color:"#555"}}>{e.description||"—"} · {e.date}</div>
                </div>
                <span style={{fontSize:15,fontWeight:700,color:"#EF4444",fontFamily:"'Space Mono',monospace"}}>{fR(e.amount)}</span>
              </div>
            ))
        }
      </div>
    </div>
  );
}
