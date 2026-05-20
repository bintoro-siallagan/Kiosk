import { useState, useEffect, useRef } from "react";
import { api, createSocket } from "./api.js";

const formatIDR = (a) => "Rp " + Math.round(a || 0).toLocaleString("id-ID");
const fmtTime   = (d) => new Date(d).toLocaleTimeString("id-ID", { hour:"2-digit", minute:"2-digit", second:"2-digit" });

export default function ESBNotif({ onBack }) {
  const [config, setConfig]       = useState({ baseUrl:"", apiKey:"", outletId:"", enabled:false, hasApiKey:false });
  const [form, setForm]           = useState({ baseUrl:"", apiKey:"", outletId:"", enabled:false });
  const [saving, setSaving]       = useState(false);
  const [saveMsg, setSaveMsg]     = useState(null);
  const [testing, setTesting]     = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [notifLog, setNotifLog]   = useState([]); // push log per order
  const [liveOrders, setLiveOrders] = useState([]);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);

  // Load config from backend
  useEffect(() => {
    api.getESBConfig().then(cfg => {
      setConfig(cfg);
      setForm({ baseUrl: cfg.baseUrl, apiKey:"", outletId: cfg.outletId, enabled: cfg.enabled });
    }).catch(() => {});

    api.getOrders().then(setLiveOrders).catch(() => {});
  }, []);

  // WebSocket — listen for order:new + esb:pushed events
  useEffect(() => {
    const socket = createSocket((msg) => {
      setConnected(true);
      if (msg.event === "order:new") {
        const o = msg.data;
        setLiveOrders(prev => [o, ...prev].slice(0, 50));
        addLog({ orderId: o.id, total: o.total, type: o.type, time: Date.now(), status: "pushing", msg: `Pesanan #${o.id} masuk — push ke ESB POS...` });
      }
      if (msg.event === "esb:pushed") {
        const { orderId, ok, error } = msg.data;
        updateLog(orderId, ok ? "ok" : "error", ok ? `✅ Order #${orderId} berhasil dikirim ke ESB POS` : `❌ Order #${orderId} gagal: ${error || "unknown"}`);
      }
      if (msg.event === "init") {
        setLiveOrders(msg.data.orders || []);
      }
    });
    socketRef.current = socket;
    return () => socket.close();
  }, []);

  function addLog(entry) {
    setNotifLog(prev => [entry, ...prev].slice(0, 100));
  }

  function updateLog(orderId, status, msg) {
    setNotifLog(prev => prev.map(l =>
      l.orderId === orderId ? { ...l, status, msg, updatedAt: Date.now() } : l
    ));
  }

  // Save config to backend
  async function handleSave() {
    setSaving(true); setSaveMsg(null);
    try {
      const payload = { ...form };
      if (!payload.apiKey) delete payload.apiKey; // don't overwrite with empty
      await api.setESBConfig(payload);
      const fresh = await api.getESBConfig();
      setConfig(fresh);
      setSaveMsg({ ok:true, text:"✅ Konfigurasi berhasil disimpan" });
    } catch (e) {
      setSaveMsg({ ok:false, text:`❌ Gagal: ${e.message}` });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 4000);
    }
  }

  // Test push
  async function handleTest() {
    setTesting(true); setTestResult(null);
    addLog({ orderId:"TEST-01", total:55000, type:"dine", time:Date.now(), status:"pushing", msg:"Test push ke ESB POS..." });
    try {
      const res = await api.testESBPush();
      setTestResult(res);
      updateLog("TEST-01", res.ok ? "ok" : "error",
        res.ok ? "✅ Test push BERHASIL — ESB POS merespons!" : `❌ Test push GAGAL: ${res.error || JSON.stringify(res)}`
      );
    } catch (e) {
      setTestResult({ ok:false, error: e.message });
      updateLog("TEST-01", "error", `❌ Test gagal: ${e.message}`);
    } finally {
      setTesting(false);
    }
  }

  // Toggle enabled
  async function handleToggle() {
    const newVal = !config.enabled;
    try {
      await api.setESBConfig({ enabled: newVal });
      setConfig(c => ({ ...c, enabled: newVal }));
      setForm(f => ({ ...f, enabled: newVal }));
    } catch {}
  }

  const recentOrders = liveOrders.slice(0, 20);

  return (
    <div style={N.root}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@700;800;900&family=DM+Sans:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#FF6B35;border-radius:2px}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        @keyframes slideIn{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)}}
        input:focus{outline:none}
      `}</style>

      {/* HEADER */}
      <div style={N.header}>
        <div style={N.hLeft}>
          <button style={N.backBtn} onClick={onBack}>← Kembali</button>
          <div>
            <div style={N.title}>🔔 ESB POS — PUSH NOTIFIKASI</div>
            <div style={N.sub}>Setiap transaksi kiosk otomatis dikirim ke ESB POS</div>
          </div>
        </div>
        <div style={N.headerRight}>
          {/* Live indicator */}
          <div style={{ display:"flex", alignItems:"center", gap:6, background:"#0d1117", border:`1px solid ${connected?"#FF6B35":"#333"}33`, borderRadius:20, padding:"6px 14px" }}>
            <div style={{ width:7, height:7, borderRadius:"50%", background: connected?"#FF6B35":"#444", animation: connected?"pulse 1.5s infinite":"none" }}/>
            <span style={{ fontSize:11, color: connected?"#FF6B35":"#555", fontWeight:700 }}>{connected?"LIVE":"OFFLINE"}</span>
          </div>
          {/* ESB enabled toggle */}
          <div style={{ display:"flex", alignItems:"center", gap:10, background:"#0d1117", border:"1px solid #21262d", borderRadius:20, padding:"8px 16px" }}>
            <span style={{ fontSize:12, color:"#888" }}>Push ke ESB</span>
            <div style={{ ...N.toggle, background: config.enabled?"#FF6B35":"#222" }} onClick={handleToggle}>
              <div style={{ ...N.toggleDot, transform: config.enabled?"translateX(20px)":"translateX(2px)" }}/>
            </div>
            <span style={{ fontSize:12, fontWeight:700, color: config.enabled?"#FF6B35":"#555" }}>
              {config.enabled ? "AKTIF" : "NONAKTIF"}
            </span>
          </div>
        </div>
      </div>

      <div style={N.body}>
        <div style={N.layout}>

          {/* ── LEFT: Config + Test ─────────────────────────────────── */}
          <div style={N.leftCol}>

            {/* Status card */}
            <div style={{ ...N.card, borderColor: config.enabled?"#FF6B3533":"#161b22" }}>
              <div style={N.cardTitle}>📡 Status Integrasi</div>
              <div style={N.statusGrid}>
                <div style={N.statusItem}>
                  <div style={N.statusDot(config.enabled?"#FF6B35":"#444")} />
                  <div>
                    <div style={{ fontSize:13, fontWeight:600 }}>Push Notifikasi</div>
                    <div style={{ fontSize:11, color: config.enabled?"#FF6B35":"#555" }}>
                      {config.enabled ? "Aktif — setiap order dikirim ke ESB" : "Nonaktif"}
                    </div>
                  </div>
                </div>
                <div style={N.statusItem}>
                  <div style={N.statusDot(config.hasApiKey?"#00C896":"#FF3B30")} />
                  <div>
                    <div style={{ fontSize:13, fontWeight:600 }}>API Key</div>
                    <div style={{ fontSize:11, color: config.hasApiKey?"#00C896":"#FF3B30" }}>
                      {config.hasApiKey ? `${config.apiKeyHint} (tersimpan)` : "Belum diisi"}
                    </div>
                  </div>
                </div>
                <div style={N.statusItem}>
                  <div style={N.statusDot(config.outletId?"#00C896":"#FF3B30")} />
                  <div>
                    <div style={{ fontSize:13, fontWeight:600 }}>Outlet ID</div>
                    <div style={{ fontSize:11, color: config.outletId?"#00C896":"#FF3B30" }}>
                      {config.outletId || "Belum diisi"}
                    </div>
                  </div>
                </div>
                <div style={N.statusItem}>
                  <div style={N.statusDot(connected?"#5AC8FA":"#444")} />
                  <div>
                    <div style={{ fontSize:13, fontWeight:600 }}>WebSocket</div>
                    <div style={{ fontSize:11, color: connected?"#5AC8FA":"#555" }}>
                      {connected ? "Terhubung — menerima order real-time" : "Tidak terhubung"}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Config form */}
            <div style={N.card}>
              <div style={N.cardTitle}>⚙️ Konfigurasi ESB POS</div>
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                {[
                  { key:"baseUrl",  label:"Base URL",    ph:"https://api.esb.co.id/eso-qs/v1", type:"text" },
                  { key:"apiKey",   label:"API Key",     ph: config.hasApiKey ? "••••••••" + config.apiKeyHint : "Bearer token ESB", type:"password" },
                  { key:"outletId", label:"Outlet ID",   ph:"Contoh: OUTLET001", type:"text" },
                ].map(f => (
                  <div key={f.key} style={{ display:"flex", flexDirection:"column", gap:5 }}>
                    <label style={N.label}>{f.label}</label>
                    <input style={N.input} type={f.type} value={form[f.key]||""}
                      placeholder={f.ph}
                      onChange={e => setForm(v => ({ ...v, [f.key]: e.target.value }))} />
                  </div>
                ))}
                <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 0" }}>
                  <span style={{ fontSize:13, color:"#888" }}>Aktifkan push otomatis</span>
                  <div style={{ ...N.toggle, background: form.enabled?"#FF6B35":"#222" }}
                    onClick={() => setForm(f => ({ ...f, enabled: !f.enabled }))}>
                    <div style={{ ...N.toggleDot, transform: form.enabled?"translateX(20px)":"translateX(2px)" }}/>
                  </div>
                </div>
              </div>
              <div style={{ display:"flex", gap:8, marginTop:4 }}>
                <button style={N.saveBtn} onClick={handleSave} disabled={saving}>
                  {saving ? "⏳ Menyimpan..." : "💾 SIMPAN"}
                </button>
                <button style={N.testBtn} onClick={handleTest} disabled={testing}>
                  {testing ? <><span style={N.spin}/>Testing...</> : "🧪 TEST PUSH"}
                </button>
              </div>
              {saveMsg && (
                <div style={{ marginTop:10, padding:"8px 12px", borderRadius:8, fontSize:12, fontWeight:600,
                  background: saveMsg.ok?"rgba(0,200,150,0.1)":"rgba(255,59,48,0.1)",
                  border: `1px solid ${saveMsg.ok?"#00C896":"#FF3B30"}44`,
                  color: saveMsg.ok?"#00C896":"#FF3B30",
                }}>{saveMsg.text}</div>
              )}
              {testResult && (
                <div style={{ marginTop:10, padding:"8px 12px", borderRadius:8, fontSize:12,
                  background: testResult.ok?"rgba(0,200,150,0.1)":"rgba(255,59,48,0.1)",
                  border: `1px solid ${testResult.ok?"#00C896":"#FF3B30"}44`,
                  color: testResult.ok?"#00C896":"#FF3B30",
                }}>
                  {testResult.ok
                    ? `✅ ESB merespons OK${testResult.endpoint ? ` via ${testResult.endpoint}` : ""}`
                    : `❌ ${testResult.error || "Gagal — cek API Key & Outlet ID"}`}
                </div>
              )}
            </div>

            {/* Flow diagram */}
            <div style={N.card}>
              <div style={N.cardTitle}>🔄 Alur Push Notifikasi</div>
              <div style={N.flow}>
                {[
                  { icon:"🛒", label:"Customer order di kiosk",     color:"#5AC8FA" },
                  { icon:"💳", label:"Pembayaran sukses",            color:"#FFB800" },
                  { icon:"📡", label:"Backend kirim ke ESB POS API", color:"#FF6B35" },
                  { icon:"🖥️", label:"ESB POS terima & proses order", color:"#00C896" },
                  { icon:"👨‍🍳", label:"Dapur mulai persiapkan",       color:"#FF6B35" },
                ].map((s, i) => (
                  <div key={i} style={N.flowRow}>
                    <div style={{ ...N.flowDot, background: s.color + "22", border:`1px solid ${s.color}44` }}>
                      <span style={{ fontSize:18 }}>{s.icon}</span>
                    </div>
                    {i < 4 && <div style={N.flowLine} />}
                    <span style={{ fontSize:12, color:"#888", flex:1 }}>{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── RIGHT: Live notif log ─────────────────────────────── */}
          <div style={N.rightCol}>
            <div style={N.card}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                <div style={N.cardTitle}>🔔 Log Push Notifikasi</div>
                <button style={N.clearBtn} onClick={() => setNotifLog([])}>🗑️ Hapus</button>
              </div>

              {notifLog.length === 0 ? (
                <div style={N.empty}>
                  <div style={{ fontSize:48, marginBottom:12 }}>🔔</div>
                  <div style={{ color:"#444", fontSize:13 }}>Menunggu transaksi masuk...</div>
                  <div style={{ color:"#333", fontSize:11, marginTop:6 }}>Setiap order akan muncul di sini secara real-time</div>
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {notifLog.map((l, i) => (
                    <div key={i} style={{ ...N.logCard,
                      borderColor: l.status==="ok"?"#00C896":l.status==="error"?"#FF3B30":l.status==="pushing"?"#FFB800":"#21262d",
                      background:  l.status==="ok"?"rgba(0,200,150,0.05)":l.status==="error"?"rgba(255,59,48,0.05)":"rgba(255,184,0,0.03)",
                      animation:   i===0?"slideIn 0.25s ease":"none",
                    }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          {l.status==="pushing" && <span style={N.spin}/>}
                          {l.status==="ok"      && <span style={{ color:"#00C896", fontSize:16 }}>✅</span>}
                          {l.status==="error"   && <span style={{ color:"#FF3B30", fontSize:16 }}>❌</span>}
                          <span style={{ fontFamily:"'Montserrat',sans-serif", fontSize:18, letterSpacing:1, color:"#fff" }}>
                            #{l.orderId}
                          </span>
                        </div>
                        <span style={{ fontSize:10, color:"#555" }}>{fmtTime(l.time)}</span>
                      </div>
                      <div style={{ fontSize:12, color:"#aaa", marginBottom:6, lineHeight:1.5 }}>{l.msg}</div>
                      <div style={{ display:"flex", gap:10 }}>
                        {l.total && <span style={{ fontSize:11, color:"#FF6B35", fontWeight:700 }}>{formatIDR(l.total)}</span>}
                        {l.type  && <span style={{ fontSize:11, color:"#555" }}>{l.type==="dine"?"🪑 Dine In":"🛍️ Takeaway"}</span>}
                        {l.status==="ok"    && <span style={{ fontSize:11, color:"#00C896" }}>Terkirim ke ESB ✓</span>}
                        {l.status==="error" && <span style={{ fontSize:11, color:"#FF3B30" }}>Gagal — akan retry</span>}
                        {l.status==="pushing" && <span style={{ fontSize:11, color:"#FFB800" }}>Mengirim...</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent orders */}
            <div style={N.card}>
              <div style={N.cardTitle}>📋 Transaksi Terbaru</div>
              {recentOrders.length === 0 && <div style={{ color:"#444", fontSize:13, textAlign:"center", padding:20 }}>Belum ada transaksi</div>}
              {recentOrders.map(o => {
                const log = notifLog.find(l => l.orderId === o.id);
                return (
                  <div key={o.id} style={N.orderRow}>
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:2 }}>
                        <span style={{ fontFamily:"'Montserrat',sans-serif", fontSize:16, color:"#FF6B35" }}>#{o.id}</span>
                        <span style={{ fontSize:11, color:"#555" }}>{fmtTime(o.time)}</span>
                        <span style={{ fontSize:11, color:"#666" }}>{o.type==="dine"?`🪑 ${o.table}`:"🛍️ Bawa"}</span>
                      </div>
                      <div style={{ fontSize:11, color:"#666" }}>{(o.items||[]).map(i => i.n||i.name).join(", ").slice(0,50)}</div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:13, fontWeight:700, color:"#fff" }}>{formatIDR(o.total)}</div>
                      <div style={{ fontSize:10, marginTop:2 }}>
                        {!log && <span style={{ color:"#444" }}>—</span>}
                        {log?.status==="pushing" && <span style={{ color:"#FFB800" }}>⏳ Push...</span>}
                        {log?.status==="ok"      && <span style={{ color:"#00C896" }}>✅ ESB OK</span>}
                        {log?.status==="error"   && <span style={{ color:"#FF3B30" }}>❌ Gagal</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const N = {
  root:    { fontFamily:"'Plus Jakarta Sans',sans-serif", background:"#080c10", color:"#fff", minHeight:"100vh", display:"flex", flexDirection:"column", position:"fixed", top:0, left:0, right:0, bottom:0, overflowY:"auto", zIndex:9999 },
  header:  { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"16px 24px", background:"#0d1117", borderBottom:"1px solid #161b22", flexWrap:"wrap", gap:12 },
  hLeft:   { display:"flex", alignItems:"center", gap:16 },
  title:   { fontFamily:"'Montserrat',sans-serif", fontSize:22, letterSpacing:3, color:"#FF6B35" },
  sub:     { fontSize:11, color:"#555" },
  backBtn: { background:"transparent", border:"1px solid #333", borderRadius:10, padding:"8px 14px", color:"#888", cursor:"pointer", fontSize:12 },
  headerRight: { display:"flex", alignItems:"center", gap:10 },
  toggle:  { width:44, height:24, borderRadius:12, cursor:"pointer", position:"relative", transition:"background 0.2s", flexShrink:0 },
  toggleDot: { position:"absolute", top:2, width:20, height:20, borderRadius:"50%", background:"#fff", transition:"transform 0.2s" },
  body:    { flex:1, padding:"20px 24px", overflowY:"auto" },
  layout:  { display:"grid", gridTemplateColumns:"380px 1fr", gap:16, alignItems:"start" },
  leftCol: { display:"flex", flexDirection:"column", gap:14 },
  rightCol:{ display:"flex", flexDirection:"column", gap:14 },
  card:    { background:"#0d1117", border:"1px solid #161b22", borderRadius:14, padding:"18px 20px" },
  cardTitle: { fontSize:11, fontWeight:700, letterSpacing:2, color:"#555", textTransform:"uppercase", marginBottom:14 },
  statusGrid:{ display:"flex", flexDirection:"column", gap:12 },
  statusItem:{ display:"flex", alignItems:"center", gap:12 },
  statusDot: (c) => ({ width:10, height:10, borderRadius:"50%", background:c, flexShrink:0 }),
  label:   { fontSize:12, fontWeight:600, color:"#aaa" },
  input:   { background:"#080c10", border:"1px solid #21262d", borderRadius:10, padding:"9px 12px", color:"#fff", fontSize:13, fontFamily:"'Plus Jakarta Sans',sans-serif" },
  saveBtn: { background:"linear-gradient(90deg,#FF6B35,#FF3B30)", border:"none", borderRadius:10, padding:"10px 20px", color:"#fff", cursor:"pointer", fontSize:13, fontWeight:700, letterSpacing:1, fontFamily:"'Montserrat',sans-serif", flex:1 },
  testBtn: { background:"#0d1117", border:"1px solid #21262d", borderRadius:10, padding:"10px 16px", color:"#aaa", cursor:"pointer", fontSize:12, fontWeight:600, display:"flex", alignItems:"center", gap:6 },
  clearBtn:{ background:"transparent", border:"1px solid #21262d", borderRadius:8, padding:"5px 10px", color:"#555", cursor:"pointer", fontSize:11 },
  spin:    { display:"inline-block", width:13, height:13, border:"2px solid #333", borderTop:"2px solid #FF6B35", borderRadius:"50%", animation:"spin 0.8s linear infinite", flexShrink:0 },
  flow:    { display:"flex", flexDirection:"column", gap:0 },
  flowRow: { display:"flex", alignItems:"center", gap:12 },
  flowDot: { width:40, height:40, borderRadius:12, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 },
  flowLine:{ width:1, height:16, background:"#21262d", marginLeft:19, marginBottom:-4, marginTop:-4 },
  logCard: { background:"transparent", border:"1px solid", borderRadius:12, padding:"12px 14px", transition:"border-color 0.3s" },
  orderRow:{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:"1px solid #0d1117" },
  empty:   { textAlign:"center", padding:"32px 0" },
};
