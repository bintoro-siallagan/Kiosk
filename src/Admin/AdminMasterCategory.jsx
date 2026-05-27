// src/Admin/AdminMasterCategory.jsx
// Master Category — kategori & sub-kategori produk + mapping COA (CRUD lengkap).

import { useState, useEffect, useCallback } from "react";
import { useUiKit , LoadingState, EmptyState } from "../components/uiKit.jsx";

const AC = "#0891b2";

export default function AdminMasterCategory({ apiBase = "" }) {
  const { confirm } = useUiKit();
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");
  const [cat, setCat] = useState({ name: "", sales_account: "4-1100", cogs_account: "5-1100" });
  const [sub, setSub] = useState({ name: "", parent_code: "" });
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/master-category`).then(r => r.json()).then(j => {
      setD(j); setSub(s => s.parent_code ? s : { ...s, parent_code: (j.categories[0] && j.categories[0].code) || "" });
    }).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const post = (body, okMsg) => {
    fetch(`${apiBase}/api/master-category`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(r => r.json()).then(j => { if (j.ok) { setMsg(okMsg); load(); } else setMsg(j.error || "gagal"); }).catch(e => setMsg(String(e)));
  };
  const toggle = (c) => {
    fetch(`${apiBase}/api/master-category/${c.id}/toggle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      .then(r => r.json()).then(j => { if (j.ok) load(); }).catch(() => {});
  };
  const saveEdit = async () => {
    const r = await fetch(`${apiBase}/api/master-category/${editing.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing),
    });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Kategori disimpan"); setEditing(null); load(); }
    else setMsg(j.error || "gagal");
  };
  const remove = async (c, isSub = false) => {
    const childCount = !isSub ? (c.subs?.length || 0) : 0;
    const ok = await confirm({
      title: `Hapus ${isSub ? "sub-kategori" : "kategori"} "${c.name}"?`,
      message: isSub ? "Sub-kategori akan dihapus permanen." : (childCount > 0 ? `Kategori ini punya ${childCount} sub-kategori — SEMUA akan ikut terhapus.` : "Kategori akan dihapus permanen."),
      danger: true, okLabel: "Delete",
    });
    if (!ok) return;
    const r = await fetch(`${apiBase}/api/master-category/${c.id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.ok) { setMsg(`✓ ${isSub ? "Sub-kategori" : "Kategori"} dihapus`); load(); }
    else setMsg(j.error || "gagal");
  };

  if (!d) return <LoadingState label="Memuat Master Category…" />;
  const s = d.summary;
  const coaOpt = (a) => `${a.code} · ${a.name}`;

  return (
    <div>
      <div style={S.intro}>
        🗂️ <b style={{ color: "#22d3ee" }}>MASTER CATEGORY</b> — kategori &amp; sub-kategori produk (2 level).
        Tiap kategori dipetakan ke <b>akun COA</b> (Pendapatan &amp; HPP) — penjualan posting ke akun yang benar.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Kategori" v={String(s.total_categories)} c={AC} />
        <Kpi label="Sub-Kategori" v={String(s.total_subcategories)} c="#3b82f6" />
        <Kpi label="Ter-mapping COA" v={`${s.coa_mapped}/${s.total_categories}`} c="#10b981" />
        <Kpi label="Active" v={String(s.active)} c="#a855f7" />
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>➕ TAMBAH KATEGORI / SUB-KATEGORI</div>
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1.6fr 1.6fr auto", gap: 8, marginTop: 10, alignItems: "center" }}>
          <input value={cat.name} onChange={e => setCat({ ...cat, name: e.target.value })} placeholder="Nama kategori baru" style={S.input} />
          <select value={cat.sales_account} onChange={e => setCat({ ...cat, sales_account: e.target.value })} style={S.input}>
            {d.coa_accounts.revenue.map(a => <option key={a.code} value={a.code}>📈 {coaOpt(a)}</option>)}
          </select>
          <select value={cat.cogs_account} onChange={e => setCat({ ...cat, cogs_account: e.target.value })} style={S.input}>
            {d.coa_accounts.cogs.map(a => <option key={a.code} value={a.code}>📉 {coaOpt(a)}</option>)}
          </select>
          <button onClick={() => { if (cat.name.trim()) { post({ ...cat }, "✓ Kategori ditambah"); setCat({ ...cat, name: "" }); } }} style={S.btn}>+ Kategori</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1.6fr auto", gap: 8, marginTop: 8, alignItems: "center" }}>
          <input value={sub.name} onChange={e => setSub({ ...sub, name: e.target.value })} placeholder="Nama sub-kategori" style={S.input} />
          <select value={sub.parent_code} onChange={e => setSub({ ...sub, parent_code: e.target.value })} style={S.input}>
            {d.categories.map(c => <option key={c.code} value={c.code}>↳ {c.name}</option>)}
          </select>
          <button onClick={() => { if (sub.name.trim()) { post({ name: sub.name, parent_code: sub.parent_code }, "✓ Sub-kategori ditambah"); setSub({ ...sub, name: "" }); } }} style={S.btnGhost}>+ Sub-Kategori</button>
        </div>
        {msg ? <div style={{ fontSize: 12, marginTop: 8, color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🗂️ DAFTAR KATEGORI — {d.categories.length}</div>
        {d.categories.length === 0 ? (
          <EmptyState icon="🗂️" title="Belum ada kategori" desc="Tambah kategori produk (mis. Minuman, Makanan, Dessert) untuk grouping menu & mapping COA." />
        ) : (
        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          {d.categories.map(c => (
            <div key={c.code} style={{ background: "#0a0e16", border: "1px solid #161b22", borderRadius: 9, padding: "11px 13px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>{c.name}</span>
                <span style={{ fontSize: 10, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>{c.code}</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 10, color: "#10b981", fontFamily: "'Geist Mono',monospace" }}>📈 {c.sales_account}</span>
                <span style={{ fontSize: 10, color: "#f59e0b", fontFamily: "'Geist Mono',monospace" }}>📉 {c.cogs_account}</span>
                <button onClick={() => toggle(c)} style={S.tog(c.is_active)}>{c.is_active ? "● AKTIF" : "○ OFF"}</button>
                <button onClick={() => setEditing({ ...c })} title="Edit" style={{ background: "#f59e0b18", border: "1px solid #f59e0b44", color: "#f59e0b", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>✏️</button>
                <button onClick={() => remove(c)} title="Delete" style={{ background: "#ef444418", border: "1px solid #ef444444", color: "#ef4444", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>🗑️</button>
              </div>
              <div style={{ fontSize: 10, color: "#5b6470", marginTop: 2 }}>{c.sales_account_name} · {c.cogs_account_name}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                {c.subs.map(sb => (
                  <span key={sb.code} style={{ display: "inline-flex", alignItems: "center", background: "#0d1117", border: "1px solid #21262d", borderRadius: 6 }}>
                    <button onClick={() => toggle(sb)} style={{ fontSize: 11, color: sb.is_active ? "#9da7b3" : "#5b6470", background: "transparent", border: "none", padding: "3px 9px", cursor: "pointer", fontFamily: "inherit", textDecoration: sb.is_active ? "none" : "line-through" }}>
                      ↳ {sb.name}
                    </button>
                    <button onClick={() => setEditing({ ...sb, _isSub: true })} title="Edit sub" style={{ background: "transparent", border: "none", color: "#f59e0b", padding: "2px 4px", cursor: "pointer", fontSize: 10 }}>✏️</button>
                    <button onClick={() => remove(sb, true)} title="Hapus sub" style={{ background: "transparent", border: "none", color: "#ef4444", padding: "2px 6px 2px 2px", cursor: "pointer", fontSize: 10 }}>×</button>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        )}
      </div>

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 12, padding: 22, maxWidth: 480, width: "100%" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 14 }}>✏️ Edit {editing._isSub ? "Sub-Kategori" : "Kategori"} — {editing.code}</div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>NAME</div>
              <input value={editing.name || ""} onChange={e => setEditing({ ...editing, name: e.target.value })} style={S.input} />
            </div>
            {!editing._isSub && (
              <>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>SALES ACCOUNT</div>
                  <select value={editing.sales_account || ""} onChange={e => setEditing({ ...editing, sales_account: e.target.value })} style={S.input}>
                    {d.coa_accounts.revenue.map(a => <option key={a.code} value={a.code}>📈 {a.code} · {a.name}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>COGS ACCOUNT</div>
                  <select value={editing.cogs_account || ""} onChange={e => setEditing({ ...editing, cogs_account: e.target.value })} style={S.input}>
                    {d.coa_accounts.cogs.map(a => <option key={a.code} value={a.code}>📉 {a.code} · {a.name}</option>)}
                  </select>
                </div>
                <div style={{ fontSize: 10, color: "#7a7b82", marginTop: 6 }}>ℹ️ Updating COA di sini juga update semua sub-kategori dalam kategori ini.</div>
              </>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button onClick={() => setEditing(null)} style={{ background: "#161b22", border: "1px solid #30363d", color: "#9ca3af", padding: "8px 14px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Cancel</button>
              <button onClick={saveEdit} style={S.btn}>💾 Simpan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, v, c }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Geist Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: c, fontFamily: "'Geist Mono',monospace", marginTop: 4 }}>{v}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Geist Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  input: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 7, padding: "8px 9px", color: "#e6edf3", fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" },
  btn: { background: "#0891b2", color: "#fff", border: "none", borderRadius: 7, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnGhost: { background: "#161b22", color: "#9da7b3", border: "1px solid #21262d", borderRadius: 7, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  tog: (on) => ({ fontSize: 9, fontWeight: 700, color: on ? "#10b981" : "#5b6470", background: (on ? "#10b981" : "#5b6470") + "1f", border: `1px solid ${(on ? "#10b981" : "#5b6470")}55`, borderRadius: 5, padding: "3px 8px", fontFamily: "'Geist Mono',monospace", cursor: "pointer" }),
};
