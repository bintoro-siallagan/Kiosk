import { useState, useEffect, useRef } from "react";
import { api, createSocket } from "./api.js";
import API_HOST from "./apiBase.js";

const fIDR = (a) => "Rp " + Math.round(a||0).toLocaleString("id-ID");
const fTime = (d) => { if (!d) return "—"; const x = new Date(d); return isNaN(x) ? "—" : x.toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"}); };
const fDate = (d) => { if (!d) return "—"; const x = new Date(d); return isNaN(x) ? "—" : x.toLocaleDateString("id-ID",{day:"numeric",month:"short",year:"numeric"}); };
const elapsed = (from) => {
  const m = Math.floor((Date.now()-from)/60000);
  return m < 60 ? `${m} menit` : `${Math.floor(m/60)}j ${m%60}m`;
};

export default function ShiftManager({ onBack }) {
  const [tab,         setTab]      = useState("shift");
  const [shift,       setShift]    = useState(null);
  const [shifts,      setShifts]   = useState([]);
  const [tables,      setTables]   = useState([]);
  const [staffCalls,  setCalls]    = useState([]);
  const [users,       setUsers]    = useState([]);
  const [loading,     setLoading]  = useState(true);
  const [toast,       setToast]    = useState(null);
  const [now,         setNow]      = useState(Date.now());

  // Open shift form
  const [openForm, setOpenForm]    = useState(false);
  const [kasirName, setKasirName]  = useState(localStorage.getItem("adminName")||"Cashier");
  const [openCash, setOpenCash]    = useState("");

  // Close shift form
  const [closeForm, setCloseForm]  = useState(false);
  const [closeCash, setCloseCash]  = useState("");
  const [closeNote, setCloseNote]  = useState("");

  // New table form
  const [showAddTable, setAddTable] = useState(false);
  const [newTable, setNewTable]     = useState({name:"",zone:"A",capacity:"4"});

  // New user form
  const [showAddUser, setAddUser]   = useState(false);
  const [newUser, setNewUser]       = useState({name:"",pin:"",role:"kasir"});

  useEffect(() => {
    const t = setInterval(()=>setNow(Date.now()), 10000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const socket = createSocket((msg) => {
      if (msg.event==="staffCall")        setCalls(p=>[msg.data,...p]);
      if (msg.event==="staffCallResolved") setCalls(p=>p.filter(c=>c.id!==msg.data.id));
      if (msg.event==="table:updated")     setTables(p=>p.map(t=>t.id===msg.data.id?msg.data:t));
    });
    return () => socket.close();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [sh, shs, tb, sc, us] = await Promise.all([
        api.getActiveShift(), api.getShifts(), api.getTables(),
        api.getStaffCalls(), api.getUsers()
      ]);
      setShift(sh && sh.active === true ? sh : null);
      // expose force-close also when no active state perceived but server still has lingering shift
      window.__forceCloseShift = async (reason) => {
        try {
          const r = await fetch(API_HOST + "/api/shifts/force-close", {
            method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({reason})
          });
          const data = await r.json();
          alert(data.ok ? "Shift force-closed: " + data.shift.id : "Gagal: " + (data.error||"unknown"));
          window.location.reload();
        } catch(e) { alert("Error: " + e.message); }
      };
      setShifts(shs); setTables(tb); setCalls(sc); setUsers(us);
    } catch {}
    finally { setLoading(false); }
  }

  function notify(msg, color="#34D399") {
    setToast({msg,color}); setTimeout(()=>setToast(null),3000);
  }

  async function handleOpenShift() {
    try {
      const s = await api.openShift({ kasirName, openingCash: Number(openCash)||0 });
      setShift(s); setOpenForm(false);
      notify(`✅ Shift dibuka — ${s.kasirName}`);
    } catch(e) { notify(e.message,"#F87171"); }
  }

  async function handleCloseShift() {
    try {
      const s = await api.closeShift({ closingCash: Number(closeCash)||0, note: closeNote });
      setShifts(p=>[s,...p]); setShift(null); setCloseForm(false);
      notify(`🔴 Shift ditutup — ${s.totalOrders} order, ${fIDR(s.totalRevenue)}`);
    } catch(e) { notify(e.message,"#F87171"); }
  }

  async function handleTableStatus(table, status) {
    const updated = await api.updateTable(table.id, {status}).catch(()=>({...table,status}));
    setTables(p=>p.map(t=>t.id===table.id?updated:t));
  }

  async function handleAddTable() {
    if (!newTable.name) return;
    const t = await api.createTable(newTable).catch(()=>null);
    if (t) { setTables(p=>[...p,t]); setAddTable(false); setNewTable({name:"",zone:"A",capacity:"4"}); notify("Meja ditambahkan ✓"); }
  }

  async function handleDeleteTable(id) {
    if (!confirm("Hapus meja ini?")) return;
    await api.deleteTable(id).catch(()=>{});
    setTables(p=>p.filter(t=>t.id!==id));
    notify("Meja dihapus");
  }

  async function resolveCall(id) {
    await api.resolveCall(id).catch(()=>{});
    setCalls(p=>p.filter(c=>c.id!==id));
    notify("Staff call resolved ✓");
  }

  async function handleAddUser() {
    if (!newUser.name || newUser.pin.length!==6) { notify("Nama dan PIN 6 digit wajib","#F87171"); return; }
    const u = await api.createUser(newUser).catch(e=>{notify(e.message,"#F87171");return null;});
    if (u) { setUsers(p=>[...p,u]); setAddUser(false); setNewUser({name:"",pin:"",role:"kasir"}); notify("User added ✓"); }
  }

  const TABS = [
    {id:"shift",  icon:"🟢", label:"Shift"},
    {id:"tables", icon:"🪑", label:"Meja",  badge:staffCalls.length||null},
    {id:"users",  icon:"👤", label:"User"},
  ];

  return (
    <div style={S.root}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:#F59E0B33;border-radius:2px}
        @keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes notif{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes ring{0%,100%{transform:rotate(0)}20%{transform:rotate(-15deg)}40%{transform:rotate(15deg)}60%{transform:rotate(-10deg)}80%{transform:rotate(10deg)}}
        input:focus,select:focus,textarea:focus{outline:none}
        button{cursor:pointer;font-family:'Inter',sans-serif;}
      `}</style>

      {toast && (
        <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",border:`1px solid ${toast.color}44`,background:`${toast.color}0f`,color:toast.color,borderRadius:10,padding:"10px 20px",fontSize:12,fontWeight:600,zIndex:999,animation:"notif 0.3s ease",whiteSpace:"nowrap"}}>
          {toast.msg}
        </div>
      )}

      <div style={S.header}>
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          <div>
            <div style={S.title}>⚙️ OPERASIONAL</div>
            <div style={S.sub}>Shift · Meja · User Admin</div>
          </div>
        </div>
        {staffCalls.length > 0 && (
          <div style={S.callAlert}>
            <span style={{animation:"ring 1s ease infinite",display:"inline-block"}}>🔔</span>
            {staffCalls.length} Staff Call
          </div>
        )}
      </div>

      <div style={S.tabBar}>
        {TABS.map(t=>(
          <button key={t.id} style={{...S.tab,...(tab===t.id?S.tabActive:{})}} onClick={()=>setTab(t.id)}>
            {t.icon} {t.label}
            {t.badge ? <span style={S.tabBadge}>{t.badge}</span> : null}
          </button>
        ))}
      </div>

      <div style={S.body}>
        {loading ? <div style={{textAlign:"center",padding:48,color:"#555"}}>Memuat...</div> : (<>

        {/* ── SHIFT TAB ── */}
        {tab==="shift" && (
          <div style={{animation:"fadeUp 0.2s ease"}}>
            {/* Active shift card */}
            {shift ? (
              <div style={{...S.card,borderColor:"#34D39933",marginBottom:16}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
                  <div>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                      <span style={{width:10,height:10,borderRadius:"50%",background:"#34D399",animation:"pulse 1.5s infinite",display:"inline-block"}}/>
                      <span style={{fontFamily:"'Geist Mono',monospace",fontSize:14,fontWeight:700,color:"#34D399"}}>SHIFT AKTIF</span>
                    </div>
                    <div style={{fontSize:20,fontWeight:700}}>{shift.kasirName}</div>
                    <div style={{fontSize:12,color:"#888",marginTop:2}}>Dibuka {fTime(shift.openAt)} · {elapsed(shift.openAt)}</div>
                  </div>
                  <button style={S.closeShiftBtn} onClick={()=>{ setCloseCash(String(shift?.expectedCash||0)); setCloseForm(true); }}>🔴 Close Shift</button>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
                  {[
                    {label:"Total Order",  val:shift.totalOrders,          color:"#F59E0B"},
                    {label:"Pendapatan",   val:fIDR(shift.totalRevenue),    color:"#34D399"},
                    {label:"Opening Cash",   val:fIDR(shift.openingCash),     color:"#38BDF8"},
                  ].map((s,i)=>(
                    <div key={i} style={{background:"#080c10",borderRadius:10,padding:"10px 12px",textAlign:"center"}}>
                      <div style={{fontFamily:"'Geist Mono',monospace",fontSize:16,fontWeight:700,color:s.color}}>{s.val}</div>
                      <div style={{fontSize:10,color:"#555",marginTop:2}}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{...S.card,textAlign:"center",marginBottom:16,borderColor:"#F8717133"}}>
                <div style={{fontSize:40,marginBottom:10}}>⏸️</div>
                <div style={{fontFamily:"'Geist Mono',monospace",fontSize:16,color:"#F87171",marginBottom:6}}>TIDAK ADA SHIFT AKTIF</div>
                <div style={{fontSize:13,color:"#666",marginBottom:20}}>Open a new shift to start receiving orders</div>
                <button style={S.openShiftBtn} onClick={()=>setOpenForm(true)}>🟢 BUKA SHIFT BARU</button>
              </div>
            )}

            {/* Shift history */}
            <div style={S.card}>
              <div style={S.cardLabel}>📋 RIWAYAT SHIFT</div>
              {shifts.length===0 && <div style={{color:"#444",fontSize:13,textAlign:"center",padding:20}}>No shifts yet</div>}
              {shifts.slice(0,10).map(sh=>(
                <div key={sh.id} style={S.shiftRow}>
                  <div style={{flex:1}}>
                    <div style={{fontFamily:"'Geist Mono',monospace",fontSize:13,fontWeight:700}}>{sh.id}</div>
                    <div style={{fontSize:12,color:"#888"}}>{sh.kasirName} · {fDate(sh.openAt)}</div>
                    <div style={{fontSize:11,color:"#666"}}>{fTime(sh.openAt)} – {sh.closeAt?fTime(sh.closeAt):"—"}</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontFamily:"'Geist Mono',monospace",fontSize:14,color:"#F59E0B"}}>{fIDR(sh.totalRevenue)}</div>
                    <div style={{fontSize:11,color:"#666"}}>{sh.totalOrders} order</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TABLES TAB ── */}
        {tab==="tables" && (
          <div style={{animation:"fadeUp 0.2s ease"}}>
            {/* Staff calls */}
            {staffCalls.length>0 && (
              <div style={{...S.card,borderColor:"#F59E0B33",marginBottom:16}}>
                <div style={{...S.cardLabel,color:"#F59E0B",display:"flex",alignItems:"center",gap:8}}>
                  <span style={{animation:"ring 1.5s ease infinite",display:"inline-block"}}>🔔</span>
                  STAFF CALL ({staffCalls.length})
                </div>
                {staffCalls.map(c=>(
                  <div key={c.id} style={S.callRow}>
                    <span style={{fontSize:20}}>🪑</span>
                    <div style={{flex:1}}>
                      <div style={{fontSize:14,fontWeight:700}}>Meja {c.tableId}</div>
                      <div style={{fontSize:12,color:"#888"}}>{c.reason} · {fTime(c.time)}</div>
                    </div>
                    <button style={S.resolveBtn} onClick={()=>resolveCall(c.id)}>✓ Selesai</button>
                  </div>
                ))}
              </div>
            )}

            {/* Table grid */}
            <div style={{...S.card,marginBottom:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <div style={S.cardLabel}>🪑 STATUS MEJA</div>
                <button style={S.addBtn} onClick={()=>setAddTable(true)}>+ Tambah Meja</button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10}}>
                {tables.map(t=>(
                  <div key={t.id} style={{...S.tableCard, borderColor:t.status==="occupied"?"#F8717144":"#1a1a2e"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                      <span style={{fontSize:22}}>🪑</span>
                      <button style={{background:"transparent",border:"none",color:"#555",fontSize:13,padding:"2px 4px"}}
                        onClick={()=>handleDeleteTable(t.id)}>✕</button>
                    </div>
                    <div style={{fontFamily:"'Geist Mono',monospace",fontSize:14,fontWeight:700,marginBottom:2}}>{t.name}</div>
                    <div style={{fontSize:11,color:"#555",marginBottom:8}}>Zona {t.zone} · {t.capacity} kursi</div>
                    <button style={{
                      width:"100%",borderRadius:8,padding:"6px",fontSize:11,fontWeight:700,
                      background:t.status==="occupied"?"rgba(52,211,153,0.1)":"rgba(248,113,113,0.1)",
                      border:`1px solid ${t.status==="occupied"?"#34D39933":"#F8717133"}`,
                      color:t.status==="occupied"?"#34D399":"#F87171",
                    }} onClick={()=>handleTableStatus(t, t.status==="occupied"?"available":"occupied")}>
                      {t.status==="occupied"?"✓ Bebaskan":"× Tandai Terisi"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── USERS TAB ── */}
        {tab==="users" && (
          <div style={{animation:"fadeUp 0.2s ease"}}>
            <div style={{...S.card,marginBottom:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <div style={S.cardLabel}>👤 USER ADMIN</div>
                <button style={S.addBtn} onClick={()=>setAddUser(true)}>+ Tambah User</button>
              </div>
              {users.map(u=>(
                <div key={u.id} style={S.userRow}>
                  <div style={{width:40,height:40,borderRadius:"50%",background:`hsl(${u.id.charCodeAt(1)*60%360},40%,30%)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:700,flexShrink:0}}>
                    {u.name[0]}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,fontWeight:600}}>{u.name}</div>
                    <div style={{fontSize:11,color:"#666"}}>PIN: {u.pin}</div>
                  </div>
                  <span style={{...S.roleBadge,
                    background:u.role==="manager"?"rgba(245,158,11,0.12)":"rgba(56,189,248,0.12)",
                    color:u.role==="manager"?"#F59E0B":"#38BDF8",
                  }}>{u.role==="manager"?"👑 Manager":"💼 Kasir"}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        </>)}
      </div>

      {/* ── OPEN SHIFT MODAL ── */}
      {openForm && (
        <div style={S.overlay} onClick={()=>setOpenForm(false)}>
          <div style={S.modal} onClick={e=>e.stopPropagation()}>
            <div style={S.modalTitle}>🟢 Open Shift Baru</div>
            <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:16}}>
              <div>
                <label style={S.label}>Cashier Name</label>
                <input style={S.input} value={kasirName} onChange={e=>setKasirName(e.target.value)} placeholder="Cashier name"/>
              </div>
              <div>
                <label style={S.label}>Opening Cash (Rp)</label>
                <input style={S.input} type="number" value={openCash} onChange={e=>setOpenCash(e.target.value)} placeholder="0"/>
              </div>
            </div>
            <div style={{display:"flex",gap:10}}>
              <button style={S.cancelBtn} onClick={()=>setOpenForm(false)}>Cancel</button>
              <button style={S.confirmBtn} onClick={handleOpenShift}>BUKA SHIFT</button>
            </div>
          </div>
        </div>
      )}

      {/* ── CLOSE SHIFT MODAL ── */}
      {closeForm && (
        <div style={S.overlay} onClick={()=>setCloseForm(false)}>
          <div style={S.modal} onClick={e=>e.stopPropagation()}>
            <div style={S.modalTitle}>🔴 Close Shift</div>
            {shift && (
              <div style={{background:"#080c10",borderRadius:10,padding:"12px",marginBottom:14}}>
                <div style={S.shiftRow}>
                  <span style={{color:"#888",fontSize:13}}>Total Order</span>
                  <span style={{fontWeight:700,color:"#F59E0B"}}>{shift.totalOrders}</span>
                </div>
                <div style={S.shiftRow}>
                  <span style={{color:"#888",fontSize:13}}>Total Revenue</span>
                  <span style={{fontWeight:700,color:"#34D399"}}>{fIDR(shift.totalRevenue)}</span>
                </div>
                <div style={S.shiftRow}>
                  <span style={{color:"#888",fontSize:13}}>Durasi</span>
                  <span style={{fontWeight:700}}>{elapsed(shift.openAt)}</span>
                </div>
                {/* Payment method breakdown */}
                {shift.byPayment && Object.entries(shift.byPayment).map(([m, amt]) => (
                  <div key={m} style={{...S.shiftRow,paddingLeft:12,fontSize:12}}>
                    <span style={{color:"#666"}}>{m === "CASH" ? "💵 Tunai" : m === "QRIS" ? "📱 QRIS" : m}</span>
                    <span style={{color:"#94A3B8",fontWeight:600}}>{fIDR(amt)}</span>
                  </div>
                ))}
                <div style={S.shiftRow}>
                  <span style={{color:"#888",fontSize:13}}>Opening Cash</span>
                  <span style={{fontWeight:700,color:"#38BDF8"}}>{fIDR(shift.openingCash||0)}</span>
                </div>
                <div style={{borderTop:"1px dashed #1f2937",margin:"8px 0 6px"}}/>
                <div style={S.shiftRow}>
                  <span style={{color:"#34D399",fontSize:13,fontWeight:600}}>Expected Cash</span>
                  <span style={{fontWeight:700,color:"#34D399",fontSize:15}}>{fIDR(shift.expectedCash||0)}</span>
                </div>
              </div>
            )}
            <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:16}}>
              <div>
                <label style={S.label}>Final Cash Tendered (Rp)</label>
                <div style={{display:"flex",gap:8}}>
                  <input style={{...S.input,flex:1}} type="number" value={closeCash} onChange={e=>setCloseCash(e.target.value)} placeholder="0"/>
                  <button type="button" onClick={()=>setCloseCash(String(shift?.expectedCash||0))}
                    style={{padding:"0 14px",background:"#1f2937",border:"1px solid #34D39966",borderRadius:8,color:"#34D399",fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
                    Pakai Expected
                  </button>
                </div>
                {closeCash !== "" && (() => {
                  const actual = Number(closeCash) || 0;
                  const expected = shift?.expectedCash || 0;
                  const delta = actual - expected;
                  const color = delta === 0 ? "#34D399" : delta < 0 ? "#F87171" : "#FB923C";
                  const label = delta === 0 ? "Pas ✓" : delta < 0 ? `Kurang ${fIDR(Math.abs(delta))}` : `Lebih ${fIDR(delta)}`;
                  return (
                    <div style={{marginTop:6,fontSize:12,color,fontWeight:600,padding:"6px 10px",background:`${color}11`,borderRadius:6,border:`1px solid ${color}33`}}>
                      Selisih: {delta === 0 ? "Rp 0" : (delta>0?"+":"-") + fIDR(Math.abs(delta))} — {label}
                    </div>
                  );
                })()}
              </div>
              <div>
                <label style={S.label}>Notes (optional)</label>
                <textarea style={{...S.input,resize:"none",height:70}} value={closeNote} onChange={e=>setCloseNote(e.target.value)} placeholder="Handover notes..."/>
              </div>
            </div>
            <div style={{display:"flex",gap:10}}>
              <button style={S.cancelBtn} onClick={()=>setCloseForm(false)}>Cancel</button>
              <button style={{...S.confirmBtn,background:"linear-gradient(90deg,#F87171,#EF4444)"}} onClick={handleCloseShift}>TUTUP SHIFT</button>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD TABLE MODAL ── */}
      {showAddTable && (
        <div style={S.overlay} onClick={()=>setAddTable(false)}>
          <div style={S.modal} onClick={e=>e.stopPropagation()}>
            <div style={S.modalTitle}>🪑 Tambah Meja</div>
            <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:16}}>
              {[
                {k:"name",    label:"Nama Meja",    ph:"Meja A5"},
                {k:"zone",    label:"Zona",          ph:"A"},
                {k:"capacity",label:"Kapasitas",     ph:"4",type:"number"},
              ].map(f=>(
                <div key={f.k}>
                  <label style={S.label}>{f.label}</label>
                  <input style={S.input} type={f.type||"text"} value={newTable[f.k]}
                    onChange={e=>setNewTable(p=>({...p,[f.k]:e.target.value}))} placeholder={f.ph}/>
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:10}}>
              <button style={S.cancelBtn} onClick={()=>setAddTable(false)}>Cancel</button>
              <button style={S.confirmBtn} onClick={handleAddTable}>TAMBAH</button>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD USER MODAL ── */}
      {showAddUser && (
        <div style={S.overlay} onClick={()=>setAddUser(false)}>
          <div style={S.modal} onClick={e=>e.stopPropagation()}>
            <div style={S.modalTitle}>👤 Tambah User Admin</div>
            <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:16}}>
              <div>
                <label style={S.label}>Nama</label>
                <input style={S.input} value={newUser.name} onChange={e=>setNewUser(p=>({...p,name:e.target.value}))} placeholder="Cashier name"/>
              </div>
              <div>
                <label style={S.label}>PIN (6 digit)</label>
                <input style={S.input} type="number" value={newUser.pin}
                  onChange={e=>setNewUser(p=>({...p,pin:e.target.value.slice(0,6)}))} placeholder="123456" maxLength={6}/>
              </div>
              <div>
                <label style={S.label}>Role</label>
                <select style={S.input} value={newUser.role} onChange={e=>setNewUser(p=>({...p,role:e.target.value}))}>
                  <option value="kasir">Cashier</option>
                  <option value="manager">Manager</option>
                </select>
              </div>
            </div>
            <div style={{display:"flex",gap:10}}>
              <button style={S.cancelBtn} onClick={()=>setAddUser(false)}>Cancel</button>
              <button style={S.confirmBtn} onClick={handleAddUser}>TAMBAH USER</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const S = {
  root:      {fontFamily:"'Inter',sans-serif",background:"#050810",color:"#fff",minHeight:"100%",display:"flex",flexDirection:"column",position:"fixed",top:0,left:0,right:0,bottom:0,overflowY:"auto",zIndex:9999},
  header:    {display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 24px",background:"#080c10",borderBottom:"1px solid #0f1629",flexWrap:"wrap",gap:10},
  title:     {fontFamily:"'Geist Mono',monospace",fontSize:18,fontWeight:700,color:"#F59E0B",letterSpacing:1},
  sub:       {fontSize:11,color:"#555"},
  backBtn:   {background:"transparent",border:"1px solid #1a1a2e",borderRadius:8,padding:"7px 12px",color:"#555",fontSize:12},
  callAlert: {display:"flex",alignItems:"center",gap:8,background:"rgba(245,158,11,0.1)",border:"1px solid rgba(245,158,11,0.3)",borderRadius:20,padding:"8px 16px",fontSize:13,fontWeight:700,color:"#F59E0B"},
  tabBar:    {display:"flex",gap:4,padding:"12px 24px",background:"#080c10",borderBottom:"1px solid #0f1629"},
  tab:       {background:"transparent",border:"1px solid #1a1a2e",borderRadius:10,padding:"8px 20px",color:"#666",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:6},
  tabActive: {background:"#F59E0B22",border:"1px solid #F59E0B44",color:"#F59E0B"},
  tabBadge:  {background:"#F87171",color:"#fff",borderRadius:10,padding:"1px 6px",fontSize:10,fontWeight:700},
  body:      {flex:1,padding:"16px 24px",overflowY:"auto"},
  card:      {background:"#0d1117",border:"1px solid #1a1a2e",borderRadius:14,padding:"18px 20px",marginBottom:16},
  cardLabel: {fontSize:11,fontWeight:700,letterSpacing:2,color:"#555",textTransform:"uppercase",marginBottom:14},
  openShiftBtn:{background:"linear-gradient(90deg,#34D399,#059669)",border:"none",borderRadius:10,padding:"12px 24px",color:"#fff",fontWeight:700,fontSize:14,letterSpacing:1,fontFamily:"'Geist Mono',monospace"},
  closeShiftBtn:{background:"rgba(248,113,113,0.12)",border:"1px solid #F8717144",borderRadius:10,padding:"10px 18px",color:"#F87171",fontWeight:700,fontSize:13},
  shiftRow:  {display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #0f1629"},
  callRow:   {display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:"1px solid #0f1629"},
  resolveBtn:{background:"rgba(52,211,153,0.12)",border:"1px solid #34D39933",borderRadius:8,padding:"6px 14px",color:"#34D399",fontWeight:700,fontSize:12},
  tableCard: {background:"#080c10",border:"1px solid",borderRadius:12,padding:"12px"},
  addBtn:    {background:"#1a1a2e",border:"1px solid #21262d",borderRadius:8,padding:"6px 14px",color:"#aaa",fontSize:12,fontWeight:600},
  userRow:   {display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:"1px solid #0f1629"},
  roleBadge: {fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:20},
  overlay:   {position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"},
  modal:     {background:"#0d1117",border:"1px solid #1a1a2e",borderRadius:16,padding:"24px",width:"100%",maxWidth:380},
  modalTitle:{fontFamily:"'Geist Mono',monospace",fontSize:16,fontWeight:700,color:"#F59E0B",marginBottom:16},
  label:     {fontSize:11,fontWeight:700,color:"#888",letterSpacing:1,textTransform:"uppercase",marginBottom:6,display:"block"},
  input:     {width:"100%",background:"#080c10",border:"1px solid #21262d",borderRadius:10,padding:"10px 14px",color:"#fff",fontSize:13,fontFamily:"'Inter',sans-serif"},
  cancelBtn: {background:"transparent",border:"1px solid #21262d",borderRadius:10,padding:"10px 20px",color:"#666",fontSize:13},
  confirmBtn:{flex:1,background:"linear-gradient(90deg,#F59E0B,#F97316)",border:"none",borderRadius:10,padding:"10px",color:"#050810",fontWeight:700,fontSize:14,fontFamily:"'Geist Mono',monospace"},
};
