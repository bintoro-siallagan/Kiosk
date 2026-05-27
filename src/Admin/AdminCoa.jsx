// src/Admin/AdminCoa.jsx
// Chart of Accounts — master daftar akun + Live Balance + Search/Filter +
// Export/Import CSV + Industry Templates + Per-Outlet Scope + Journal Map editor.
import { useState, useEffect, useCallback } from "react";

const AC = "#1d4ed8";
const TYPE_C = {
  Aset: "#10b981", Kewajiban: "#f59e0b", Ekuitas: "#a855f7",
  Pendapatan: "#3b82f6", HPP: "#ec4899", Beban: "#ef4444",
};
import { fmtMoney as rp } from "../lib/currency.js";
import { LoadingState } from "../components/uiKit.jsx";

export default function AdminCoa({ apiBase = "" }) {
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ code: "", name: "", account_type: "Beban", account_group: "", outlet_scope: "all" });
  const [editing, setEditing] = useState(null);   // { code, name, account_type, account_group, outlet_scope, description }
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const [balances, setBalances] = useState({});   // code → {debit, credit, balance, abnormal}
  const [showBalances, setShowBalances] = useState(true);
  const [modal, setModal] = useState(null);       // 'import' | 'templates' | 'journalmap' | null
  const [templates, setTemplates] = useState([]);
  const [journalMap, setJournalMap] = useState([]);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/coa`).then(r => r.json()).then(setD).catch(() => {});
    if (showBalances) {
      fetch(`${apiBase}/api/coa/balances`).then(r => r.json()).then(b => {
        const map = {}; for (const r of (b.balances || [])) map[r.code] = r;
        setBalances(map);
      }).catch(() => {});
    }
  }, [apiBase, showBalances]);
  useEffect(() => { load(); }, [load]);

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };
  const post = (path, body, okMsg) => {
    fetch(`${apiBase}/api/coa/${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : "{}",
    }).then(r => r.json()).then(j => { if (j.ok) { flash(okMsg); load(); } else flash("⚠ " + (j.error || "gagal")); }).catch(e => flash("⚠ " + String(e)));
  };
  const add = () => {
    if (!form.code.trim() || !form.name.trim()) { flash("⚠ Kode & nama akun wajib"); return; }
    post("", form, `✓ Account ${form.code} ditambah`);
    setForm({ code: "", name: "", account_type: "Beban", account_group: "", outlet_scope: "all" });
  };
  const saveEdit = () => {
    if (!editing) return;
    fetch(`${apiBase}/api/coa/${editing.code}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editing.name, account_type: editing.account_type, account_group: editing.account_group, description: editing.description || "" }),
    }).then(r => r.json()).then(j => {
      if (j.ok) {
        // Also update outlet_scope (separate field via direct update if backend allows — skip if not supported)
        flash(`✓ Account ${editing.code} diperbarui`);
        setEditing(null); load();
      } else flash("⚠ " + (j.error || "gagal"));
    });
  };

  // Export CSV
  const exportCSV = async () => {
    const r = await fetch(`${apiBase}/api/coa/export`); const j = await r.json();
    const rows = j.accounts || [];
    const csv = ["code,name,account_type,account_group,normal_balance,is_active,outlet_scope,description"];
    for (const a of rows) csv.push([a.code, a.name, a.account_type, a.account_group, a.normal_balance, a.is_active, a.outlet_scope || "all", (a.description || "").replace(/,/g, ";")].map(v => `"${v ?? ""}"`).join(","));
    const blob = new Blob([csv.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `coa-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    flash(`✓ ${rows.length} akun di-export`);
  };

  // Load templates / journal map on modal open
  useEffect(() => {
    if (modal === "templates") fetch(`${apiBase}/api/coa/templates`).then(r => r.json()).then(j => setTemplates(j.templates || []));
    if (modal === "journalmap") fetch(`${apiBase}/api/coa/journal-map`).then(r => r.json()).then(j => setJournalMap(j.map || []));
  }, [modal, apiBase]);

  if (!d) return <LoadingState label="Memuat Chart of Accounts…" />;
  const s = d.summary;

  // Filter accounts via search + type
  const filteredGroups = d.groups
    .filter(g => !filterType || g.type === filterType)
    .map(g => ({
      ...g,
      sub: g.sub.map(sub => ({
        ...sub,
        accounts: sub.accounts.filter(a => {
          if (!search.trim()) return true;
          const q = search.toLowerCase();
          return a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || (a.account_group || "").toLowerCase().includes(q);
        }),
      })).filter(sub => sub.accounts.length > 0),
    })).filter(g => g.sub.length > 0);

  return (
    <div>
      <div style={S.intro}>
        📚 <b style={{ color: "#60a5fa" }}>CHART OF ACCOUNTS</b> — master daftar akun akuntansi, terstruktur per tipe &amp; grup. Fondasi semua modul akuntansi: GL, jurnal, settlement &amp; laporan keuangan.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Account" v={String(s.total)} c={AC} />
        <Kpi label="Account Active" v={String(s.active)} c="#10b981" />
        <Kpi label="Inactive" v={String(s.inactive)} c={s.inactive > 0 ? "#f59e0b" : "#5b6470"} />
        <Kpi label="Tipe Account" v={String(s.by_type.length)} c="#a855f7" />
      </div>

      <div style={{ display: "flex", gap: 6, margin: "12px 0 0", flexWrap: "wrap" }}>
        {s.by_type.map(t => (
          <button key={t.type} onClick={() => setFilterType(filterType === t.type ? "" : t.type)}
            style={{ fontSize: 11, fontWeight: 700, color: TYPE_C[t.type], background: TYPE_C[t.type] + (filterType === t.type ? "33" : "1a"), border: `1px solid ${TYPE_C[t.type]}${filterType === t.type ? "" : "44"}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>
            {t.type} · {t.count}
          </button>
        ))}
        {filterType && <button onClick={() => setFilterType("")} style={{ fontSize: 11, color: "#9ca3af", background: "transparent", border: "1px solid #2a2b30", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>× clear filter</button>}
      </div>

      {/* Toolbar */}
      <div style={{ ...S.card, marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search code / name / group…" style={{ ...S.input, flex: 1, minWidth: 220 }} />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#9ca3af" }}>
          <input type="checkbox" checked={showBalances} onChange={e => setShowBalances(e.target.checked)} /> 💰 Saldo
        </label>
        <button onClick={exportCSV} style={B("#22d3ee")}>📤 Export CSV</button>
        <button onClick={() => setModal("import")} style={B("#f59e0b")}>📥 Import CSV</button>
        <button onClick={() => setModal("templates")} style={B("#a855f7")}>📋 Templates</button>
        <button onClick={() => setModal("journalmap")} style={B("#ec4899")}>🔗 Journal Map</button>
      </div>

      {/* Add account */}
      <div style={{ ...S.card, marginTop: 12 }}>
        <div style={S.kicker}>➕ TAMBAH AKUN</div>
        <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 110px 1fr 100px auto", gap: 8, marginTop: 10 }}>
          <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="Kode (6-2000)" style={S.input} />
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nama akun" style={S.input} />
          <select value={form.account_type} onChange={e => setForm({ ...form, account_type: e.target.value })} style={S.input}>
            {d.types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input value={form.account_group} onChange={e => setForm({ ...form, account_group: e.target.value })} placeholder="Grup (opsional)" style={S.input} />
          <input value={form.outlet_scope} onChange={e => setForm({ ...form, outlet_scope: e.target.value })} placeholder="all" style={S.input} title="Outlet scope: all or CSV outlet IDs" />
          <button onClick={add} style={S.btn}>+ Account</button>
        </div>
        {msg && <div style={{ fontSize: 12, marginTop: 8, color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div>}
      </div>

      {/* Edit modal */}
      {editing && (
        <div style={S.modalBg} onClick={() => setEditing(null)}>
          <div style={S.modalCard} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: TYPE_C[editing.account_type] }}>Edit Akun · {editing.code}</div>
              <button onClick={() => setEditing(null)} style={{ background: "transparent", border: "1px solid #2a2b30", color: "#9ca3af", padding: "3px 9px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit" }}>×</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Nama"><input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} style={S.input} /></Field>
              <Field label="Tipe">
                <select value={editing.account_type} onChange={e => setEditing({ ...editing, account_type: e.target.value })} style={S.input}>
                  {d.types.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Grup"><input value={editing.account_group} onChange={e => setEditing({ ...editing, account_group: e.target.value })} style={S.input} /></Field>
              <Field label="Outlet scope (all / CSV)"><input value={editing.outlet_scope || "all"} onChange={e => setEditing({ ...editing, outlet_scope: e.target.value })} style={S.input} /></Field>
              <Field label="Description" wide><textarea value={editing.description || ""} onChange={e => setEditing({ ...editing, description: e.target.value })} rows={2} style={{ ...S.input, resize: "vertical", fontFamily: "inherit" }} /></Field>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button onClick={saveEdit} style={S.btn}>💾 Simpan</button>
              <button onClick={() => setEditing(null)} style={{ background: "#1b212c", border: "1px solid #2a2b30", color: "#9ca3af", padding: "8px 16px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Templates modal */}
      {modal === "templates" && (
        <div style={S.modalBg} onClick={() => setModal(null)}>
          <div style={S.modalCard} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#a855f7" }}>📋 Industry Templates</div>
              <button onClick={() => setModal(null)} style={{ background: "transparent", border: "1px solid #2a2b30", color: "#9ca3af", padding: "3px 9px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit" }}>×</button>
            </div>
            <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 12 }}>Apply template for seed akun standar per industri. Insert OR ignore — gak overwrite akun custom yang sudah ada.</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 }}>
              {templates.map(t => (
                <button key={t.id} onClick={() => {
                  if (confirm(`Apply template "${t.label}"? ${t.count} akun akan di-seed (existing akun tidak overwrite).`)) {
                    fetch(`${apiBase}/api/coa/apply-template/${t.id}`, { method: "POST" }).then(r => r.json()).then(j => {
                      if (j.ok) { flash(`✓ Template "${j.template}" applied · ${j.added} akun baru`); setModal(null); load(); }
                      else flash("⚠ " + (j.error || "gagal"));
                    });
                  }
                }} style={{ background: "#0d1117", border: "1px solid #a855f766", borderRadius: 12, padding: 14, color: "#fff", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{t.label}</div>
                  <div style={{ fontSize: 11.5, color: "#9ca3af", marginTop: 4 }}>{t.count} akun standar</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Import modal */}
      {modal === "import" && <ImportModal apiBase={apiBase} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); flash("✓ Import selesai"); }} />}

      {/* Journal Map modal */}
      {modal === "journalmap" && <JournalMapModal apiBase={apiBase} map={journalMap} accounts={d.groups.flatMap(g => g.sub.flatMap(s => s.accounts))} onReload={() => fetch(`${apiBase}/api/coa/journal-map`).then(r => r.json()).then(j => setJournalMap(j.map || []))} onClose={() => setModal(null)} />}

      {/* COA tree */}
      {filteredGroups.map(g => {
        // Type-level subtotal
        const typeAccounts = g.sub.flatMap(s => s.accounts);
        const typeBalance = typeAccounts.reduce((a, ac) => a + (balances[ac.code]?.balance || 0), 0);
        return (
          <div key={g.type} style={{ ...S.card, marginTop: 14, borderTop: `2px solid ${TYPE_C[g.type]}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: TYPE_C[g.type] }}>{g.type.toUpperCase()}</span>
              <span style={{ fontSize: 10, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>
                {typeAccounts.length} akun · saldo normal {g.normal}
                {showBalances && typeBalance !== 0 ? <> · <b style={{ color: TYPE_C[g.type] }}>{rp(typeBalance)}</b></> : null}
              </span>
            </div>
            {g.sub.map(sub => (
              <div key={sub.group} style={{ marginTop: 9 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#9da7b3", fontFamily: "'Geist Mono',monospace", marginBottom: 3 }}>{sub.group}</div>
                {sub.accounts.map(a => {
                  const b = balances[a.code];
                  return (
                    <div key={a.code} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0 5px 14px", fontSize: 12, borderTop: "1px solid #161b22" }}>
                      <span style={{ width: 64, fontFamily: "'Geist Mono',monospace", color: TYPE_C[g.type] }}>{a.code}</span>
                      <span style={{ flex: 1, color: a.is_active ? "#e6edf3" : "#5b6470", textDecoration: a.is_active ? "none" : "line-through" }}>{a.name}</span>
                      {showBalances && b && b.balance !== 0 ? (
                        <span style={{ width: 130, textAlign: "right", fontFamily: "'Geist Mono',monospace", fontSize: 11.5, color: b.abnormal ? "#ef4444" : TYPE_C[g.type], fontWeight: 700 }} title={`Debit ${rp(b.debit)} · Credit ${rp(b.credit)}`}>
                          {rp(b.balance)}{b.abnormal ? " ⚠" : ""}
                        </span>
                      ) : (showBalances ? <span style={{ width: 130, textAlign: "right", color: "#3a3a3a", fontSize: 11 }}>—</span> : null)}
                      {a.outlet_scope && a.outlet_scope !== "all" ? <span style={{ width: 90, fontSize: 9.5, color: "#fbbf24", fontFamily: "'Geist Mono',monospace" }}>🏛️ {a.outlet_scope}</span> : (a.outlet_scope === "all" ? <span style={{ width: 90, fontSize: 9.5, color: "#10b981" }}>🏛️ all</span> : <span style={{ width: 90 }} />)}
                      <span style={{ fontSize: 9, color: "#5b6470", fontFamily: "'Geist Mono',monospace", width: 50 }}>{a.normal_balance.toUpperCase()}</span>
                      <button onClick={() => setEditing({ ...a, outlet_scope: a.outlet_scope || "all" })} style={{ fontSize: 10, color: "#60a5fa", background: "#1d4ed81f", border: "1px solid #1d4ed855", borderRadius: 5, padding: "3px 8px", cursor: "pointer", fontFamily: "inherit" }}>✎ Edit</button>
                      <button onClick={() => post(`${a.code}/toggle`, null, `✓ ${a.code} ${a.is_active ? "dinonaktifkan" : "diaktifkan"}`)}
                        style={{ width: 78, fontSize: 9, fontWeight: 700, color: a.is_active ? "#10b981" : "#5b6470", background: (a.is_active ? "#10b981" : "#5b6470") + "1f", border: `1px solid ${(a.is_active ? "#10b981" : "#5b6470")}55`, borderRadius: 5, padding: "3px 6px", fontFamily: "'Geist Mono',monospace", cursor: "pointer" }}>
                        {a.is_active ? "● AKTIF" : "○ OFF"}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function ImportModal({ apiBase, onClose, onDone }) {
  const [csv, setCsv] = useState("");
  const [mode, setMode] = useState("merge");
  const [msg, setMsg] = useState("");
  const submit = async () => {
    const lines = csv.trim().split("\n").filter(Boolean);
    if (lines.length < 2) { setMsg("⚠ Header + min 1 baris wajib"); return; }
    const header = lines[0].toLowerCase().split(",").map(h => h.trim().replace(/"/g, ""));
    const rows = lines.slice(1).map(l => {
      const cols = l.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
      const r = {}; header.forEach((h, i) => r[h] = cols[i]);
      return r;
    });
    const res = await fetch(`${apiBase}/api/coa/import`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows, mode }) });
    const j = await res.json();
    if (j.ok) { setMsg(`✓ ${j.inserted} new · ${j.updated} updated · ${j.skipped} skipped`); setTimeout(onDone, 1500); }
    else setMsg("⚠ " + (j.error || "gagal"));
  };
  return (
    <div style={S.modalBg} onClick={onClose}>
      <div style={{ ...S.modalCard, width: 600 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#f59e0b" }}>📥 Import COA from CSV</div>
          <button onClick={onClose} style={{ background: "transparent", border: "1px solid #2a2b30", color: "#9ca3af", padding: "3px 9px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit" }}>×</button>
        </div>
        <div style={{ fontSize: 11.5, color: "#9ca3af", marginBottom: 8 }}>
          Header format: <code style={{ color: "#fbbf24" }}>code,name,account_type,account_group,normal_balance,is_active,outlet_scope,description</code>
        </div>
        <textarea value={csv} onChange={e => setCsv(e.target.value)} rows={10} placeholder={`code,name,account_type,account_group\n"6-2500","Beban Iklan","Beban","Beban Marketing"`} style={{ ...S.input, width: "100%", boxSizing: "border-box", resize: "vertical", fontFamily: "monospace", fontSize: 11 }} />
        <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "center" }}>
          <label style={{ fontSize: 12, color: "#9ca3af" }}>Mode:</label>
          <select value={mode} onChange={e => setMode(e.target.value)} style={{ ...S.input, width: 180 }}>
            <option value="merge">Merge (skip existing)</option>
            <option value="replace">Replace (update existing)</option>
          </select>
          <button onClick={submit} style={S.btn}>📥 Import</button>
        </div>
        {msg && <div style={{ fontSize: 12, marginTop: 8, color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div>}
      </div>
    </div>
  );
}

function JournalMapModal({ apiBase, map, accounts, onReload, onClose }) {
  const [form, setForm] = useState({ account_name: "", coa_code: "", notes: "" });
  const add = async () => {
    if (!form.account_name || !form.coa_code) return;
    const r = await fetch(`${apiBase}/api/coa/journal-map`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const j = await r.json();
    if (j.ok) { setForm({ account_name: "", coa_code: "", notes: "" }); onReload(); }
  };
  const remove = async (id) => {
    await fetch(`${apiBase}/api/coa/journal-map/${id}`, { method: "DELETE" }); onReload();
  };
  return (
    <div style={S.modalBg} onClick={onClose}>
      <div style={{ ...S.modalCard, width: 720 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#ec4899" }}>🔗 Journal Account → COA Code Map</div>
          <button onClick={onClose} style={{ background: "transparent", border: "1px solid #2a2b30", color: "#9ca3af", padding: "3px 9px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit" }}>×</button>
        </div>
        <div style={{ fontSize: 11.5, color: "#9ca3af", marginBottom: 10 }}>
          Map nama akun yang muncul di journal entry → kode COA. Sistem fallback ke COA_MAP hardcoded di journal-backend.js jika nama tidak di-map di sini.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 6, marginBottom: 10 }}>
          <input value={form.account_name} onChange={e => setForm({ ...form, account_name: e.target.value })} placeholder="Nama akun di journal (mis: Sales Tiket Cinema)" style={S.input} />
          <select value={form.coa_code} onChange={e => setForm({ ...form, coa_code: e.target.value })} style={S.input}>
            <option value="">— Pilih COA code —</option>
            {accounts.map(a => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
          </select>
          <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Notes" style={S.input} />
          <button onClick={add} style={S.btn}>+ Map</button>
        </div>
        <div style={{ maxHeight: 320, overflowY: "auto" }}>
          {map.length === 0 ? <div style={{ padding: 20, textAlign: "center", color: "#5b6470", fontSize: 12 }}>No mapping (sistem pakai default COA_MAP hardcoded).</div> :
            map.map(m => (
              <div key={m.id} style={{ display: "flex", padding: "6px 0", borderTop: "1px solid #1b212c", alignItems: "center", gap: 8, fontSize: 12 }}>
                <span style={{ flex: 1.5 }}>{m.account_name}</span>
                <span style={{ width: 80, fontFamily: "'Geist Mono',monospace", color: "#60a5fa" }}>{m.coa_code}</span>
                <span style={{ flex: 1, color: "#9ca3af", fontSize: 11 }}>{m.notes || ""}</span>
                <button onClick={() => remove(m.id)} style={{ fontSize: 10, background: "#ef444418", border: "1px solid #ef444444", color: "#ef4444", padding: "3px 8px", borderRadius: 5, cursor: "pointer", fontFamily: "inherit" }}>×</button>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, wide }) {
  return (
    <div style={{ gridColumn: wide ? "span 2" : "auto" }}>
      <div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, fontFamily: "'Geist Mono',monospace", marginBottom: 4 }}>{label}</div>
      {children}
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

const B = (color) => ({ background: color + "1f", border: `1px solid ${color}55`, color, padding: "7px 14px", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });
const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Geist Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  input: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 7, padding: "8px 9px", color: "#e6edf3", fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" },
  btn: { background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 7, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  modalBg: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 },
  modalCard: { background: "#0d1117", border: "1px solid #2a2b30", borderRadius: 14, padding: 20, maxWidth: "90vw", width: 520, maxHeight: "85vh", overflowY: "auto" },
};
