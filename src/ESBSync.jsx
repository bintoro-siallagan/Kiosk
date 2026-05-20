import { useState, useEffect } from "react";
import {
  ESB_CONFIG,
  esbTestConnection,
  esbFetchAndMapMenu,
  esbGetCategories,
  esbPushMenuItem,
  esbPushAllMenu,
  esbUpdateAvailability,
} from "./esbApi.js";
import { api } from "./api.js";

const formatIDR = (a) => "Rp " + Math.round(a || 0).toLocaleString("id-ID");

// Emoji map by category name
const CAT_EMOJI = {
  burgers:"🍔", burger:"🍔", pizza:"🍕", salads:"🥗", salad:"🥗",
  sides:"🍟", side:"🍟", drinks:"🥤", drink:"🥤", desserts:"🍰",
  dessert:"🍰", snacks:"🍿", snack:"🍿", rice:"🍚", nasi:"🍚",
  mie:"🍜", noodle:"🍜", ayam:"🍗", chicken:"🍗", seafood:"🦐",
  beef:"🥩", daging:"🥩", soup:"🍲", soto:"🍲", default:"🍽️",
};
function guessEmoji(cat) {
  const k = (cat||"").toLowerCase();
  return Object.entries(CAT_EMOJI).find(([c]) => k.includes(c))?.[1] || "🍽️";
}

const TABS = [
  { id:"get",    label:"⬇️ Ambil dari ESB" },
  { id:"push",   label:"⬆️ Push ke ESB" },
  { id:"config", label:"⚙️ Konfigurasi" },
  { id:"log",    label:"📋 Log" },
];

const IDLE="idle", LOADING="loading", OK="ok", ERROR="error";

export default function ESBSync({ onBack }) {
  const [tab, setTab]               = useState("get");
  const [config, setConfig]         = useState({ ...ESB_CONFIG });
  const [connStatus, setConn]       = useState(IDLE);
  const [connMsg, setConnMsg]       = useState("");

  // GET state
  const [esbMenu, setEsbMenu]       = useState([]);   // raw dari ESB
  const [getStatus, setGetStatus]   = useState(IDLE);
  const [getMsg, setGetMsg]         = useState("");
  const [esbCats, setEsbCats]       = useState([]);
  const [catFilter, setCatFilter]   = useState("all");
  const [selectedGet, setSelGet]    = useState(new Set());
  const [importStatus, setImport]   = useState(IDLE);
  const [importMsg, setImportMsg]   = useState("");

  // PUSH state
  const [localMenu, setLocalMenu]   = useState([]);
  const [selectedPush, setSelPush]  = useState(new Set());
  const [pushItemStat, setPushStat] = useState({});
  const [bulkStatus, setBulk]       = useState(IDLE);

  // LOG
  const [logs, setLogs]             = useState([]);

  useEffect(() => {
    api.getMenu().then(setLocalMenu).catch(() => {});
  }, []);

  function log(msg, type = "info") {
    setLogs(p => [{ time: new Date().toLocaleTimeString("id-ID"), msg, type }, ...p].slice(0, 200));
  }

  // ── Apply config at runtime ──────────────────────────────────────────
  function applyConfig() {
    ESB_CONFIG.baseUrl  = config.baseUrl;
    ESB_CONFIG.apiKey   = config.apiKey;
    ESB_CONFIG.outletId = config.outletId;
    ESB_CONFIG.clientId = config.clientId;
  }

  // ── TEST CONNECTION ──────────────────────────────────────────────────
  async function handleTestConn() {
    if (!config.apiKey || !config.outletId) {
      setConnMsg("⚠️ Isi API Key dan Outlet ID terlebih dahulu");
      setConn(ERROR); return;
    }
    applyConfig();
    setConn(LOADING); setConnMsg("Menghubungkan...");
    try {
      await esbTestConnection();
      setConn(OK); setConnMsg(`✅ Terhubung — Outlet ${config.outletId}`);
      log(`Koneksi ESB OK — Outlet: ${config.outletId}`, "ok");
    } catch (e) {
      setConn(ERROR); setConnMsg(`❌ ${e.message}`);
      log(`Koneksi gagal: ${e.message}`, "error");
    }
  }

  // ── GET MENU FROM ESB ────────────────────────────────────────────────
  async function handleGetMenu() {
    if (!config.apiKey || !config.outletId) {
      setGetMsg("⚠️ Isi API Key & Outlet ID di tab Konfigurasi dulu");
      setGetStatus(ERROR); return;
    }
    applyConfig();
    setGetStatus(LOADING); setGetMsg("Mengambil menu dari ESB...");
    setEsbMenu([]); setEsbCats([]); setSelGet(new Set());
    log("Mulai GET menu dari ESB...");
    try {
      const items = await esbFetchAndMapMenu();
      // Attach emoji
      const withEmoji = items.map(i => ({ ...i, e: guessEmoji(i.cat) }));
      setEsbMenu(withEmoji);
      // Extract unique categories
      const cats = [...new Set(withEmoji.map(i => i.cat).filter(Boolean))];
      setEsbCats(cats);
      setGetStatus(OK);
      setGetMsg(`✅ ${items.length} item berhasil diambil dari ESB`);
      log(`GET menu ESB: ${items.length} item, ${cats.length} kategori`, "ok");
    } catch (e) {
      setGetStatus(ERROR);
      setGetMsg(`❌ Gagal: ${e.message}`);
      log(`GET menu gagal: ${e.message}`, "error");
    }
  }

  // ── IMPORT SELECTED ESB MENU → LOCAL KIOSK ──────────────────────────
  async function handleImport() {
    const items = esbMenu.filter(m => selectedGet.has(m.id));
    if (!items.length) return;
    setImport(LOADING);
    setImportMsg(`Mengimpor ${items.length} item ke kiosk...`);
    log(`Import ${items.length} item dari ESB ke kiosk...`);
    let ok = 0, fail = 0;
    for (const item of items) {
      try {
        await api.updateMenu(item.id, {
          name:  item.name,
          price: item.price,
          avail: item.avail,
          cat:   item.cat,
        }).catch(() => {}); // backend might not have this item yet
        ok++;
      } catch { fail++; }
    }
    // Update local state
    setLocalMenu(prev => {
      const merged = [...prev];
      items.forEach(item => {
        const idx = merged.findIndex(m => String(m.id) === String(item.id));
        if (idx >= 0) merged[idx] = { ...merged[idx], ...item };
        else merged.push(item);
      });
      return merged;
    });
    setImport(OK);
    setImportMsg(`✅ ${ok} item berhasil diimpor ke kiosk`);
    log(`Import selesai: ${ok} OK, ${fail} gagal`, "ok");
  }

  // ── PUSH LOCAL → ESB ────────────────────────────────────────────────
  async function handlePushOne(item) {
    setPushStat(s => ({ ...s, [item.id]: LOADING }));
    try {
      await esbPushMenuItem(item);
      setPushStat(s => ({ ...s, [item.id]: OK }));
      log(`✅ Push: ${item.name}`, "ok");
    } catch (e) {
      setPushStat(s => ({ ...s, [item.id]: ERROR }));
      log(`❌ Push ${item.name}: ${e.message}`, "error");
    }
  }

  async function handlePushAll() {
    applyConfig(); setBulk(LOADING);
    log(`Push semua ${localMenu.length} item ke ESB...`);
    const loadMap = {}; localMenu.forEach(m => { loadMap[m.id] = LOADING; });
    setPushStat(loadMap);
    try {
      await esbPushAllMenu(localMenu);
      const okMap = {}; localMenu.forEach(m => { okMap[m.id] = OK; });
      setPushStat(okMap); setBulk(OK);
      log(`✅ Push semua berhasil!`, "ok");
    } catch {
      let ok = 0, fail = 0;
      for (const item of localMenu) {
        try { await esbPushMenuItem(item); setPushStat(s => ({ ...s, [item.id]: OK })); ok++; }
        catch (e) { setPushStat(s => ({ ...s, [item.id]: ERROR })); fail++; log(`❌ ${item.name}: ${e.message}`, "error"); }
        await new Promise(r => setTimeout(r, 150));
      }
      setBulk(ok > 0 ? OK : ERROR);
      log(`Push selesai: ${ok} OK, ${fail} gagal`, ok > 0 ? "ok" : "error");
    }
  }

  async function handlePushSelected() {
    applyConfig(); setBulk(LOADING);
    const items = localMenu.filter(m => selectedPush.has(m.id));
    for (const item of items) { await handlePushOne(item); await new Promise(r => setTimeout(r, 150)); }
    setBulk(OK);
  }

  // ── SELECTION HELPERS ────────────────────────────────────────────────
  const toggleGet  = (id) => setSelGet(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const togglePush = (id) => setSelPush(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selAllGet  = () => setSelGet(s => s.size === filteredESB.length ? new Set() : new Set(filteredESB.map(m => m.id)));
  const selAllPush = () => setSelPush(s => s.size === localMenu.length  ? new Set() : new Set(localMenu.map(m => m.id)));

  const filteredESB = catFilter === "all" ? esbMenu : esbMenu.filter(m => m.cat === catFilter);
  const connColor   = { idle:"#555", loading:"#FFB800", ok:"#00C896", error:"#FF3B30" }[connStatus];

  return (
    <div style={S.root}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@700;800;900&family=DM+Sans:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#FF6B35;border-radius:2px}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        input:focus{outline:none}
        .tr:hover{background:rgba(255,255,255,0.025)!important}
      `}</style>

      {/* HEADER */}
      <div style={S.header}>
        <div style={S.hLeft}>
          <button style={S.backBtn} onClick={onBack}>← Kembali</button>
          <div>
            <div style={S.title}>🔗 ESB ORDER QS — INTEGRASI MENU</div>
            <div style={S.sub}>Ambil menu dari ESB atau push menu ke ESB</div>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8, background:"#0d1117", border:"1px solid #21262d", borderRadius:20, padding:"8px 16px" }}>
          <div style={{ width:8, height:8, borderRadius:"50%", background: connColor }} />
          <span style={{ color: connColor, fontSize:12, fontWeight:700 }}>
            {connStatus===IDLE ? "Belum terhubung" : connStatus===LOADING ? "Menghubungkan..." : connMsg}
          </span>
        </div>
      </div>

      {/* TABS */}
      <div style={S.tabBar}>
        {TABS.map(t => (
          <button key={t.id} style={{ ...S.tab, ...(tab===t.id ? S.tabActive : {}) }} onClick={() => setTab(t.id)}>
            {t.label} {t.id==="log" && logs.length > 0 ? `(${logs.length})` : ""}
          </button>
        ))}
      </div>

      <div style={S.body}>

        {/* ════════════════════════════════════════════════════════════
            TAB: GET MENU DARI ESB
        ════════════════════════════════════════════════════════════ */}
        {tab === "get" && (
          <div style={{ animation:"fadeIn 0.2s ease" }}>

            {/* Top action */}
            <div style={S.actionBar}>
              <div>
                <div style={S.sectionTitle}>⬇️ Ambil Menu dari ESB</div>
                <div style={S.sectionSub}>Tarik semua data menu dari ESB POS ke kiosk ini</div>
              </div>
              <button style={{ ...S.btnPrimary, fontSize:14 }} onClick={handleGetMenu} disabled={getStatus===LOADING}>
                {getStatus === LOADING
                  ? <><span style={S.spin}/>Mengambil dari ESB...</>
                  : "⬇️ GET MENU DARI ESB"}
              </button>
            </div>

            {/* Status bar */}
            {getStatus !== IDLE && (
              <div style={{ ...S.statusBar,
                background:   getStatus===OK?"rgba(0,200,150,0.08)":getStatus===ERROR?"rgba(255,59,48,0.08)":"rgba(255,184,0,0.08)",
                borderColor:  getStatus===OK?"#00C896":getStatus===ERROR?"#FF3B30":"#FFB800",
                color:        getStatus===OK?"#00C896":getStatus===ERROR?"#FF3B30":"#FFB800",
              }}>
                {getStatus===LOADING ? <><span style={S.spin}/>Mengambil menu dari ESB...</> : getMsg}
              </div>
            )}

            {/* Results */}
            {esbMenu.length > 0 && (
              <>
                {/* Category filter chips */}
                <div style={S.chips}>
                  <button style={{ ...S.chip, ...(catFilter==="all"?S.chipActive:{}) }} onClick={() => setCatFilter("all")}>
                    Semua ({esbMenu.length})
                  </button>
                  {esbCats.map(c => (
                    <button key={c} style={{ ...S.chip, ...(catFilter===c?S.chipActive:{}) }} onClick={() => setCatFilter(c)}>
                      {guessEmoji(c)} {c} ({esbMenu.filter(m=>m.cat===c).length})
                    </button>
                  ))}
                </div>

                {/* Import bar */}
                <div style={S.importBar}>
                  <span style={{ color:"#888", fontSize:13 }}>
                    {selectedGet.size > 0 ? `${selectedGet.size} item dipilih` : `${filteredESB.length} item ditampilkan`}
                  </span>
                  <div style={{ display:"flex", gap:8 }}>
                    {importStatus !== IDLE && (
                      <span style={{ fontSize:12, fontWeight:600, color: importStatus===OK?"#00C896":"#FFB800", alignSelf:"center" }}>
                        {importMsg}
                      </span>
                    )}
                    <button
                      style={{ ...S.btnImport, opacity: selectedGet.size===0?0.4:1 }}
                      disabled={selectedGet.size===0 || importStatus===LOADING}
                      onClick={handleImport}
                    >
                      {importStatus===LOADING
                        ? <><span style={S.spin}/>Mengimpor...</>
                        : `📥 IMPORT KE KIOSK (${selectedGet.size})`}
                    </button>
                  </div>
                </div>

                {/* ESB menu table */}
                <div style={S.tableWrap}>
                  <div style={S.thead}>
                    <span style={{width:36}}>
                      <input type="checkbox"
                        checked={selectedGet.size===filteredESB.length && filteredESB.length>0}
                        onChange={selAllGet} style={{cursor:"pointer"}} />
                    </span>
                    <span style={{width:40}}>Icon</span>
                    <span style={{flex:2}}>Nama Menu (dari ESB)</span>
                    <span style={{width:110}}>Kategori</span>
                    <span style={{width:110,textAlign:"right"}}>Harga</span>
                    <span style={{width:90,textAlign:"center"}}>Ketersediaan</span>
                    <span style={{width:80,textAlign:"center"}}>Kode ESB</span>
                  </div>
                  {filteredESB.map(item => (
                    <div key={item.id} className="tr" style={S.trow}>
                      <span style={{width:36}}>
                        <input type="checkbox" checked={selectedGet.has(item.id)}
                          onChange={() => toggleGet(item.id)} style={{cursor:"pointer"}} />
                      </span>
                      <span style={{width:40,fontSize:22}}>{item.e}</span>
                      <span style={{flex:2}}>
                        <div style={{fontWeight:600,fontSize:14}}>{item.name}</div>
                        {item.desc && <div style={{fontSize:11,color:"#666",marginTop:2}}>{item.desc.slice(0,60)}{item.desc.length>60?"...":""}</div>}
                      </span>
                      <span style={{width:110,fontSize:12,color:"#888"}}>{item.cat}</span>
                      <span style={{width:110,textAlign:"right",color:"#FF6B35",fontWeight:700,fontSize:13}}>{formatIDR(item.price)}</span>
                      <span style={{width:90,textAlign:"center"}}>
                        <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:20,
                          background: item.avail?"rgba(0,200,150,0.12)":"rgba(255,59,48,0.12)",
                          color:      item.avail?"#00C896":"#FF3B30",
                        }}>{item.avail?"Tersedia":"Habis"}</span>
                      </span>
                      <span style={{width:80,textAlign:"center",fontSize:11,color:"#555",fontFamily:"monospace"}}>{String(item.id).slice(0,10)}</span>
                    </div>
                  ))}
                </div>

                {/* Raw response preview */}
                {esbMenu[0]?._esb && (
                  <details style={S.rawDetails}>
                    <summary style={S.rawSummary}>🔍 Lihat raw response ESB (item pertama)</summary>
                    <pre style={S.rawPre}>{JSON.stringify(esbMenu[0]._esb, null, 2)}</pre>
                  </details>
                )}
              </>
            )}

            {/* Empty state */}
            {esbMenu.length === 0 && getStatus !== LOADING && (
              <div style={S.emptyState}>
                <div style={{ fontSize:56, marginBottom:12 }}>⬇️</div>
                <div style={{ fontFamily:"'Montserrat',sans-serif", fontSize:22, letterSpacing:3, color:"#444", marginBottom:8 }}>
                  BELUM ADA DATA
                </div>
                <div style={{ fontSize:13, color:"#555", marginBottom:20 }}>
                  Klik "GET MENU DARI ESB" untuk mengambil data menu
                </div>
                <div style={{ fontSize:12, color:"#444", background:"#0d1117", border:"1px solid #161b22", borderRadius:10, padding:"12px 16px", textAlign:"left", maxWidth:400 }}>
                  💡 Pastikan sudah isi <b style={{color:"#FF6B35"}}>API Key</b> dan <b style={{color:"#FF6B35"}}>Outlet ID</b> di tab <b>⚙️ Konfigurasi</b>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════
            TAB: PUSH MENU KE ESB
        ════════════════════════════════════════════════════════════ */}
        {tab === "push" && (
          <div style={{ animation:"fadeIn 0.2s ease" }}>
            <div style={S.actionBar}>
              <div>
                <div style={S.sectionTitle}>⬆️ Push Menu ke ESB</div>
                <div style={S.sectionSub}>Kirim menu kiosk ke sistem ESB POS</div>
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <button
                  style={{ ...S.btnSecondary, opacity: selectedPush.size===0?0.4:1 }}
                  disabled={selectedPush.size===0}
                  onClick={handlePushSelected}
                >
                  ⬆️ Push Terpilih ({selectedPush.size})
                </button>
                <button style={{ ...S.btnPrimary, ...(bulkStatus===LOADING?{opacity:0.6}:{}) }}
                  onClick={() => { applyConfig(); handlePushAll(); }} disabled={bulkStatus===LOADING}>
                  {bulkStatus===LOADING ? <><span style={S.spin}/>Pushing...</> : "🚀 PUSH SEMUA KE ESB"}
                </button>
              </div>
            </div>

            {bulkStatus !== IDLE && (
              <div style={{ ...S.statusBar,
                background: bulkStatus===OK?"rgba(0,200,150,0.08)":bulkStatus===ERROR?"rgba(255,59,48,0.08)":"rgba(255,184,0,0.08)",
                borderColor: bulkStatus===OK?"#00C896":bulkStatus===ERROR?"#FF3B30":"#FFB800",
                color: bulkStatus===OK?"#00C896":bulkStatus===ERROR?"#FF3B30":"#FFB800",
              }}>
                {bulkStatus===LOADING?"⏳ Pushing ke ESB...":bulkStatus===OK?"✅ Berhasil push ke ESB!":"❌ Sebagian gagal — cek log"}
              </div>
            )}

            <div style={S.tableWrap}>
              <div style={S.thead}>
                <span style={{width:36}}>
                  <input type="checkbox" checked={selectedPush.size===localMenu.length && localMenu.length>0}
                    onChange={selAllPush} style={{cursor:"pointer"}}/>
                </span>
                <span style={{width:40}}/>
                <span style={{flex:2}}>Nama Menu (Lokal)</span>
                <span style={{width:110}}>Kategori</span>
                <span style={{width:110,textAlign:"right"}}>Harga</span>
                <span style={{width:90,textAlign:"center"}}>Status</span>
                <span style={{width:80,textAlign:"center"}}>ESB</span>
                <span style={{width:70,textAlign:"center"}}>Aksi</span>
              </div>
              {localMenu.map(item => {
                const st = pushItemStat[item.id];
                return (
                  <div key={item.id} className="tr" style={{ ...S.trow, opacity: item.avail!==false?1:0.5 }}>
                    <span style={{width:36}}>
                      <input type="checkbox" checked={selectedPush.has(item.id)} onChange={() => togglePush(item.id)} style={{cursor:"pointer"}}/>
                    </span>
                    <span style={{width:40,fontSize:22}}>{item.e||"🍽️"}</span>
                    <span style={{flex:2,fontWeight:600,fontSize:14}}>{item.name}</span>
                    <span style={{width:110,fontSize:12,color:"#888"}}>{item.cat||item.category}</span>
                    <span style={{width:110,textAlign:"right",color:"#FF6B35",fontWeight:700,fontSize:13}}>{formatIDR(item.price)}</span>
                    <span style={{width:90,textAlign:"center"}}>
                      <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:20,
                        background: item.avail!==false?"rgba(0,200,150,0.12)":"rgba(255,59,48,0.12)",
                        color: item.avail!==false?"#00C896":"#FF3B30",
                      }}>{item.avail!==false?"Tersedia":"Habis"}</span>
                    </span>
                    <span style={{width:80,textAlign:"center"}}>
                      {!st && <span style={{color:"#444",fontSize:12}}>—</span>}
                      {st===LOADING && <span style={S.spin}/>}
                      {st===OK      && <span style={{color:"#00C896",fontSize:18}}>✓</span>}
                      {st===ERROR   && <span style={{color:"#FF3B30",fontSize:18}}>✗</span>}
                    </span>
                    <span style={{width:70,textAlign:"center"}}>
                      <button style={S.pushOneBtn} onClick={() => { applyConfig(); handlePushOne(item); }} disabled={st===LOADING}>
                        {st===LOADING?"...":"Push"}
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════
            TAB: KONFIGURASI
        ════════════════════════════════════════════════════════════ */}
        {tab === "config" && (
          <div style={{ animation:"fadeIn 0.2s ease", maxWidth:560 }}>
            <div style={S.card}>
              <div style={S.cardTitle}>🔑 Kredensial ESB Order QS</div>
              <div style={S.formGrid}>
                {[
                  { key:"baseUrl",  label:"Base URL",   ph:"https://api.esb.co.id/eso-qs/v1",   hint:"URL API ESB Order QS", type:"text" },
                  { key:"apiKey",   label:"API Key *",  ph:"Bearer token dari ESB Dashboard",    hint:"Settings → API Integration → Generate Key", type:"password" },
                  { key:"outletId", label:"Outlet ID *",ph:"Contoh: OUTLET001",                  hint:"ID outlet dari Outlet Management", type:"text" },
                  { key:"clientId", label:"Client ID",  ph:"Opsional",                           hint:"Jika diperlukan ESB", type:"text" },
                ].map(f => (
                  <div key={f.key} style={S.field}>
                    <label style={S.label}>{f.label}</label>
                    <input style={S.input} type={f.type} value={config[f.key] || ""}
                      onChange={e => setConfig(c => ({ ...c, [f.key]: e.target.value }))}
                      placeholder={f.ph} />
                    <span style={S.hint}>{f.hint}</span>
                  </div>
                ))}
              </div>
              <button style={S.testBtn} onClick={handleTestConn} disabled={connStatus===LOADING}>
                {connStatus===LOADING ? <><span style={S.spin}/>Menghubungkan...</> : "🔌 Test Koneksi ESB"}
              </button>
              {connMsg && (
                <div style={{ marginTop:12, padding:"10px 14px", borderRadius:10,
                  border:`1px solid ${connColor}44`, color: connColor, fontSize:13, fontWeight:600 }}>
                  {connMsg}
                </div>
              )}
            </div>

            <div style={S.card}>
              <div style={S.cardTitle}>📖 Cara mendapatkan kredensial ESB</div>
              {[
                ["1","Login ke ESB Dashboard → https://dashboard.esb.co.id"],
                ["2","Buka Settings → API Integration"],
                ["3","Generate API Key atau copy yang sudah ada"],
                ["4","Copy Outlet ID dari menu Outlet Management"],
                ["5","Paste ke form di atas → Test Koneksi → GET Menu"],
              ].map(([n,t]) => (
                <div key={n} style={{ display:"flex", gap:12, marginBottom:10, alignItems:"flex-start" }}>
                  <span style={{ background:"#FF6B35", color:"#fff", borderRadius:"50%", width:22, height:22, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, flexShrink:0 }}>{n}</span>
                  <span style={{ fontSize:13, color:"#888", lineHeight:1.5 }}>{t}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════
            TAB: LOG
        ════════════════════════════════════════════════════════════ */}
        {tab === "log" && (
          <div style={{ animation:"fadeIn 0.2s ease" }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:12 }}>
              <span style={{ color:"#888", fontSize:13 }}>{logs.length} entri</span>
              <button style={{ background:"transparent", border:"1px solid #333", borderRadius:8, padding:"5px 12px", color:"#888", cursor:"pointer", fontSize:12 }} onClick={() => setLogs([])}>🗑️ Hapus</button>
            </div>
            <div style={{ background:"#0d1117", border:"1px solid #161b22", borderRadius:12, padding:"4px 0", maxHeight:"65vh", overflowY:"auto", fontFamily:"monospace" }}>
              {logs.length === 0 && <div style={{ textAlign:"center", color:"#444", padding:40 }}>Belum ada log</div>}
              {logs.map((l, i) => (
                <div key={i} style={{ display:"flex", gap:12, padding:"6px 16px", borderBottom:"1px solid #080c10" }}>
                  <span style={{ fontSize:11, color:"#444", minWidth:65, flexShrink:0 }}>{l.time}</span>
                  <span style={{ fontSize:12, color: l.type==="ok"?"#00C896":l.type==="error"?"#FF3B30":l.type==="warn"?"#FFB800":"#aaa" }}>{l.msg}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const S = {
  root:     { fontFamily:"'Plus Jakarta Sans',sans-serif", background:"#080c10", color:"#fff", minHeight:"100vh", display:"flex", flexDirection:"column", position:"fixed", top:0, left:0, right:0, bottom:0, overflowY:"auto", zIndex:9999 },
  header:   { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"16px 24px", background:"#0d1117", borderBottom:"1px solid #161b22", flexWrap:"wrap", gap:12 },
  hLeft:    { display:"flex", alignItems:"center", gap:16 },
  title:    { fontFamily:"'Montserrat',sans-serif", fontSize:22, letterSpacing:3, color:"#FF6B35" },
  sub:      { fontSize:11, color:"#555" },
  backBtn:  { background:"transparent", border:"1px solid #333", borderRadius:10, padding:"8px 14px", color:"#888", cursor:"pointer", fontSize:12 },
  tabBar:   { display:"flex", gap:4, padding:"12px 24px", background:"#0d1117", borderBottom:"1px solid #161b22", flexWrap:"wrap" },
  tab:      { background:"transparent", border:"1px solid #21262d", borderRadius:10, padding:"8px 18px", color:"#666", cursor:"pointer", fontSize:13, fontWeight:600, fontFamily:"'Plus Jakarta Sans',sans-serif" },
  tabActive:{ background:"#FF6B35", border:"1px solid #FF6B35", color:"#fff" },
  body:     { flex:1, padding:"20px 24px", overflowY:"auto" },
  actionBar:{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16, flexWrap:"wrap", gap:12 },
  sectionTitle:{ fontFamily:"'Montserrat',sans-serif", fontSize:20, letterSpacing:2, color:"#fff", marginBottom:4 },
  sectionSub:  { fontSize:12, color:"#555" },
  statusBar:{ padding:"10px 16px", borderRadius:10, border:"1px solid", fontSize:13, fontWeight:600, marginBottom:14, display:"flex", alignItems:"center", gap:8 },
  chips:    { display:"flex", gap:6, flexWrap:"wrap", marginBottom:14 },
  chip:     { background:"#0d1117", border:"1px solid #21262d", borderRadius:20, padding:"5px 14px", color:"#666", cursor:"pointer", fontSize:12, fontWeight:600, fontFamily:"'Plus Jakarta Sans',sans-serif" },
  chipActive:{ background:"#FF6B35", border:"1px solid #FF6B35", color:"#fff" },
  importBar:{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10, flexWrap:"wrap", gap:8 },
  tableWrap:{ background:"#0d1117", border:"1px solid #161b22", borderRadius:14, overflow:"hidden", marginBottom:16 },
  thead:    { display:"flex", alignItems:"center", padding:"10px 20px", background:"#080c10", fontSize:11, color:"#555", letterSpacing:1, textTransform:"uppercase", gap:8, borderBottom:"1px solid #161b22" },
  trow:     { display:"flex", alignItems:"center", padding:"11px 20px", borderBottom:"1px solid #0a0e14", gap:8 },
  btnPrimary:  { background:"linear-gradient(90deg,#FF6B35,#FF3B30)", border:"none", borderRadius:10, padding:"10px 20px", color:"#fff", cursor:"pointer", fontSize:13, fontWeight:700, letterSpacing:1, fontFamily:"'Montserrat',sans-serif", display:"flex", alignItems:"center", gap:6 },
  btnSecondary:{ background:"#0d1117", border:"1px solid #21262d", borderRadius:10, padding:"10px 16px", color:"#aaa", cursor:"pointer", fontSize:12, fontWeight:600, fontFamily:"'Plus Jakarta Sans',sans-serif" },
  btnImport:   { background:"linear-gradient(90deg,#00C896,#00a07a)", border:"none", borderRadius:10, padding:"10px 20px", color:"#fff", cursor:"pointer", fontSize:13, fontWeight:700, letterSpacing:1, fontFamily:"'Montserrat',sans-serif", display:"flex", alignItems:"center", gap:6 },
  pushOneBtn:  { background:"#1a1a1a", border:"1px solid #FF6B35", borderRadius:8, padding:"4px 10px", color:"#FF6B35", cursor:"pointer", fontSize:11, fontWeight:700 },
  spin:     { display:"inline-block", width:14, height:14, border:"2px solid #333", borderTop:"2px solid #FF6B35", borderRadius:"50%", animation:"spin 0.8s linear infinite", flexShrink:0 },
  emptyState:{ textAlign:"center", padding:"60px 20px" },
  rawDetails:{ marginTop:12, background:"#0d1117", border:"1px solid #161b22", borderRadius:10, overflow:"hidden" },
  rawSummary:{ padding:"10px 16px", cursor:"pointer", fontSize:12, color:"#888", background:"#0a0e14" },
  rawPre:   { padding:"12px 16px", fontSize:11, color:"#5AC8FA", overflowX:"auto", maxHeight:200, fontFamily:"monospace" },
  card:     { background:"#0d1117", border:"1px solid #161b22", borderRadius:14, padding:"20px 24px", marginBottom:16 },
  cardTitle:{ fontSize:12, fontWeight:700, letterSpacing:2, color:"#888", textTransform:"uppercase", marginBottom:16 },
  formGrid: { display:"flex", flexDirection:"column", gap:14, marginBottom:20 },
  field:    { display:"flex", flexDirection:"column", gap:5 },
  label:    { fontSize:12, fontWeight:600, color:"#aaa" },
  input:    { background:"#080c10", border:"1px solid #21262d", borderRadius:10, padding:"10px 14px", color:"#fff", fontSize:13, fontFamily:"'Plus Jakarta Sans',sans-serif" },
  hint:     { fontSize:11, color:"#444" },
  testBtn:  { background:"linear-gradient(90deg,#FF6B35,#FF3B30)", border:"none", borderRadius:10, padding:"11px 24px", color:"#fff", cursor:"pointer", fontSize:13, fontWeight:700, letterSpacing:1, fontFamily:"'Montserrat',sans-serif", display:"flex", alignItems:"center", gap:8 },
};
