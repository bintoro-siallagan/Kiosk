// src/Admin/AdminItemPricing.jsx
// Item Pricing — multi-price, channel rule & tax/finance per item.

import { useState, useEffect, useCallback } from "react";
import { useUiKit , LoadingState} from "../components/uiKit.jsx";

import { fmtMoney as fmtRp } from "../lib/currency.js";
const AC = "#22c55e";
const PRICE_KEYS = [
  ["dinein", "Dine-in"], ["takeaway", "Takeaway"], ["online", "Online"],
  ["kiosk", "Kiosk"], ["employee", "Employee"], ["franchise", "Franchise"],
];

export default function AdminItemPricing({ apiBase = "" }) {
  const { confirm } = useUiKit();
  const [d, setD] = useState(null);
  const [sel, setSel] = useState(null);
  const [edit, setEdit] = useState(null);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    fetch(`${apiBase}/api/item-pricing`).then(r => r.json()).then(j => {
      setD(j);
      setSel(s => s || (j.items[0] && j.items[0].item_code));
    }).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const item = d && d.items.find(i => i.item_code === sel);
  useEffect(() => {
    if (item) setEdit({ prices: { ...item.prices }, channels: [...item.channels], tax_type: item.tax_type });
  }, [sel, d]); // eslint-disable-line

  const save = () => {
    fetch(`${apiBase}/api/item-pricing/${sel}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(edit),
    }).then(r => r.json()).then(j => {
      if (j.ok) { setMsg("✓ Pricing tersimpan"); load(); } else setMsg(j.error || "gagal");
    }).catch(e => setMsg(String(e)));
  };

  const saveEdit = async () => {
    const payload = {
      prices: editing.prices,
      channels: editing.channels,
      tax_type: editing.tax_type,
    };
    const r = await fetch(`${apiBase}/api/item-pricing/${editing.item_code}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Disimpan"); setEditing(null); load(); }
    else setMsg(j.error || "gagal");
  };

  const remove = async (item) => {
    const ok = await confirm({ title: `Hapus pricing "${item.name || item.item_code}"?`, message: "Pricing item akan dihapus. Item master tidak terpengaruh, tapi item kehilangan harga channel.", danger: true, okLabel: "Delete" });
    if (!ok) return;
    const r = await fetch(`${apiBase}/api/item-pricing/${item.item_code}`, { method: "DELETE" });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Dihapus"); load(); }
    else setMsg(j.error || "gagal");
  };

  if (!d) return <LoadingState label="Memuat Item Pricing…" />;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        💲 <b style={{ color: AC }}>ITEM PRICING</b> — multi-price (dine-in, takeaway, online, kiosk,
        employee, franchise), sales channel rule &amp; tax/finance config per item.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Item Ber-harga" v={String(s.total)} c={AC} />
        <Kpi label="Avg Price Dine-in" v={fmtRp(s.avg_dinein)} c="#3b82f6" />
        <Kpi label="Online Markup" v={"+" + fmtRp(s.online_markup)} c="#f59e0b" />
        <Kpi label="Full Channel" v={`${s.full_channel}/${s.total}`} c="#a855f7" sub="6 channel" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 14, marginTop: 14, alignItems: "start" }}>
        {/* Item list */}
        <div style={S.card}>
          <div style={S.kicker}>📋 ITEM — {d.items.length}</div>
          <div style={{ marginTop: 8, maxHeight: 460, overflowY: "auto" }}>
            {d.items.map(it => {
              const on = it.item_code === sel;
              return (
                <div key={it.item_code} onClick={() => setSel(it.item_code)}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderRadius: 7, cursor: "pointer", marginBottom: 3, background: on ? AC + "22" : "transparent", border: `1px solid ${on ? AC : "transparent"}` }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#e6edf3" }}>{it.name}</div>
                    <div style={{ fontSize: 10, color: "#5b6470" }}>{it.category} · {it.channels.length} channel</div>
                  </div>
                  <span style={{ fontSize: 12, fontFamily: "'Geist Mono',monospace", color: "#9da7b3", marginRight: 6 }}>{fmtRp(it.prices.dinein)}</span>
                  <div style={{ display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => setEditing({ ...it, prices: { ...it.prices }, channels: [...it.channels] })} title="Edit" style={{ background: "#f59e0b18", border: "1px solid #f59e0b44", color: "#f59e0b", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>✏️</button>
                    <button onClick={() => remove(it)} title="Delete" style={{ background: "#ef444418", border: "1px solid #ef444444", color: "#ef4444", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>🗑️</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Detail */}
        <div style={S.card}>
          {!item || !edit ? <div style={{ color: "#5b6470" }}>Pilih item.</div> : (
            <>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#e6edf3" }}>{item.name}</div>
              <div style={{ fontSize: 11, color: "#5b6470", fontFamily: "'Geist Mono',monospace", marginBottom: 12 }}>{item.item_code} · {item.category}</div>

              <div style={S.kicker}>💲 MULTI-PRICE</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, margin: "8px 0 14px" }}>
                {PRICE_KEYS.map(([k, lbl]) => (
                  <label key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0a0e16", border: "1px solid #21262d", borderRadius: 7, padding: "6px 10px" }}>
                    <span style={{ fontSize: 12, color: "#9da7b3" }}>{lbl}</span>
                    <input type="number" value={edit.prices[k]} onChange={e => setEdit({ ...edit, prices: { ...edit.prices, [k]: e.target.value } })}
                      style={{ width: 90, background: "transparent", border: "none", color: "#e6edf3", fontSize: 13, fontFamily: "'Geist Mono',monospace", textAlign: "right", outline: "none" }} />
                  </label>
                ))}
              </div>

              <div style={S.kicker}>📲 SALES CHANNEL</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0 14px" }}>
                {d.channel_catalog.map(ch => {
                  const on = edit.channels.includes(ch);
                  return (
                    <button key={ch} onClick={() => setEdit({ ...edit, channels: on ? edit.channels.filter(c => c !== ch) : [...edit.channels, ch] })}
                      style={{ background: on ? AC : "#0a0e16", border: `1px solid ${on ? AC : "#21262d"}`, color: on ? "#04140c" : "#9da7b3", fontSize: 12, fontWeight: 600, padding: "6px 11px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit" }}>
                      {on ? "✓ " : ""}{ch}
                    </button>
                  );
                })}
              </div>

              <div style={S.kicker}>🧾 TAX & FINANCE</div>
              <div style={{ margin: "8px 0 14px" }}>
                <select value={edit.tax_type} onChange={e => setEdit({ ...edit, tax_type: e.target.value })} style={S.input}>
                  {d.tax_types.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <div style={{ fontSize: 11, color: "#5b6470", marginTop: 6, lineHeight: 1.6 }}>
                  Sales account: <span style={{ color: "#9da7b3" }}>{item.sales_account}</span><br />
                  COGS account: <span style={{ color: "#9da7b3" }}>{item.cogs_account}</span> · auto GL posting
                </div>
              </div>

              <button onClick={save} style={S.btn}>Simpan Pricing</button>
              {msg ? <span style={{ fontSize: 12, marginLeft: 10, color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</span> : null}
            </>
          )}
        </div>
      </div>

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 12, padding: 22, maxWidth: 540, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 14 }}>✏️ Edit Pricing — {editing.name || editing.item_code}</div>
            <div style={{ display: "grid", gap: 10 }}>
              {PRICE_KEYS.map(([k, lbl]) => (
                <label key={k} style={{ fontSize: 11, color: "#9ca3af" }}>{lbl}
                  <input type="number" value={editing.prices[k] || 0} onChange={e => setEditing({ ...editing, prices: { ...editing.prices, [k]: Number(e.target.value) || 0 } })} style={modalInp} />
                </label>
              ))}
              <label style={{ fontSize: 11, color: "#9ca3af" }}>Tax Type
                <select value={editing.tax_type || ""} onChange={e => setEditing({ ...editing, tax_type: e.target.value })} style={modalInp}>
                  {(d.tax_types || []).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 6 }}>Sales Channels</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {(d.channel_catalog || []).map(ch => {
                    const on = (editing.channels || []).includes(ch);
                    return (
                      <button key={ch} onClick={() => setEditing({ ...editing, channels: on ? editing.channels.filter(c => c !== ch) : [...(editing.channels || []), ch] })}
                        style={{ background: on ? AC : "#0a0e16", border: `1px solid ${on ? AC : "#30363d"}`, color: on ? "#04140c" : "#9da7b3", fontSize: 11, fontWeight: 600, padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit" }}>
                        {on ? "✓ " : ""}{ch}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button onClick={() => setEditing(null)} style={{ background: "#161b22", border: "1px solid #30363d", color: "#9ca3af", padding: "8px 14px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Cancel</button>
              <button onClick={saveEdit} style={{ background: "#10b981", color: "#04130c", border: "none", padding: "8px 18px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>💾 Simpan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const modalInp = { background: "#0a0e16", border: "1px solid #30363d", borderRadius: 7, padding: "8px 11px", color: "#e6edf3", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", width: "100%" };

function Kpi({ label, v, c, sub }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Geist Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: c, fontFamily: "'Geist Mono',monospace", margin: "4px 0 2px" }}>{v}</div>
      <div style={{ fontSize: 10, color: "#5b6470" }}>{sub || " "}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Geist Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  input: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 7, padding: "8px 10px", color: "#e6edf3", fontSize: 13, fontFamily: "inherit", outline: "none" },
  btn: { background: "#22c55e", color: "#04140c", border: "none", borderRadius: 7, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
};
