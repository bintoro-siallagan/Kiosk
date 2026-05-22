// src/Admin/AdminGoodsDelivery.jsx
// Good Delivery → Good Received. Warehouse kirim ke outlet, outlet
// konfirmasi terima → stok naik + expired date dicatat.

import { useState, useEffect, useCallback } from "react";

const fmtDate = (ts) => ts ? new Date(ts * 1000).toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : "—";
const fromDateInput = (s) => s ? Math.floor(new Date(s + "T00:00:00").getTime() / 1000) : null;

export default function AdminGoodsDelivery({ apiBase = "" }) {
  const [gds, setGds] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [items, setItems] = useState([]);
  const [msg, setMsg] = useState("");
  const [toOutlet, setToOutlet] = useState("");
  const [poRef, setPoRef] = useState("");
  const [lines, setLines] = useState([]);
  const [pickId, setPickId] = useState("");
  const [pickQty, setPickQty] = useState("");
  const [recv, setRecv] = useState({});

  const load = useCallback(() => {
    fetch(`${apiBase}/api/goods-delivery`).then(r => r.json())
      .then(d => setGds(Array.isArray(d) ? d : [])).catch(() => {});
  }, [apiBase]);
  useEffect(() => {
    load();
    fetch(`${apiBase}/api/outlets`).then(r => r.json()).then(d => {
      const o = []; (d.areas || []).forEach(a => (a.outlets || []).forEach(x => o.push(`${a.area} — ${x.name}`)));
      setOutlets(o);
    }).catch(() => {});
    fetch(`${apiBase}/api/price-list`).then(r => r.json())
      .then(d => setItems(Array.isArray(d) ? d : [])).catch(() => {});
  }, [apiBase, load]);

  const addLine = () => {
    const it = items.find(x => String(x.id) === String(pickId));
    if (!it || !(Number(pickQty) > 0)) { setMsg("⚠ pilih item & isi qty"); return; }
    setLines([...lines, { sku: it.sku, item_name: it.item_name, unit: it.unit, qty: Number(pickQty) }]);
    setPickId(""); setPickQty(""); setMsg("");
  };
  const ship = () => {
    if (!toOutlet) { setMsg("⚠ pilih outlet tujuan"); return; }
    if (!lines.length) { setMsg("⚠ belum ada item"); return; }
    fetch(`${apiBase}/api/goods-delivery`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to_outlet: toOutlet, po_ref: poRef, shipped_by: "Warehouse", items: lines }),
    }).then(r => r.json()).then(j => {
      if (j.ok) { setMsg("✓ " + j.gd_number + " dikirim ke " + toOutlet); setLines([]); setToOutlet(""); setPoRef(""); load(); }
      else setMsg(j.error || "gagal mengirim");
    }).catch(e => setMsg(String(e)));
  };
  const receive = (gd) => {
    const r = recv[gd.id] || {};
    const body = {
      received_by: "Outlet",
      items: gd.items.map(it => ({
        id: it.id,
        qty_received: r[it.id] && r[it.id].qty !== undefined ? r[it.id].qty : it.qty_delivered,
        expired_date: fromDateInput(r[it.id] && r[it.id].exp),
      })),
    };
    fetch(`${apiBase}/api/goods-delivery/${gd.id}/receive`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(r => r.json()).then(j => {
      if (j.ok) { setMsg("✓ Barang " + gd.gd_number + " diterima — stok bertambah"); load(); }
      else setMsg(j.error || "gagal");
    }).catch(e => setMsg(String(e)));
  };
  const setRF = (gdId, itId, field, val) => setRecv(s => ({
    ...s, [gdId]: { ...(s[gdId] || {}), [itId]: { ...((s[gdId] || {})[itId] || {}), [field]: val } },
  }));

  const closeGd = (gd) => {
    fetch(`${apiBase}/api/goods-delivery/${gd.id}/close`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      .then(r => r.json()).then(j => { if (j.ok) { setMsg("✓ " + gd.gd_number + " ditutup — dokumen final"); load(); } else setMsg(j.error || "gagal"); }).catch(e => setMsg(String(e)));
  };

  const inTransit = gds.filter(g => g.status === "in_transit");
  const received = gds.filter(g => g.status === "received");
  const closed = gds.filter(g => g.status === "closed");

  return (
    <div>
      <div style={S.intro}>
        🚚 <b style={{ color: "#06B6D4" }}>GOOD DELIVERY → GOOD RECEIVED</b> — warehouse kirim barang
        ke outlet tujuan, outlet konfirmasi terima → <b>stok otomatis bertambah</b> + tanggal expired barang dicatat.
      </div>

      {msg ? <div style={{ ...S.card, marginBottom: 12, color: msg.startsWith("✓") ? "#10b981" : "#f87171", fontSize: 13 }}>{msg}</div> : null}

      {/* KIRIM */}
      <div style={S.card}>
        <div style={S.kicker}>🚚 KIRIM BARANG (GOOD DELIVERY)</div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8, marginTop: 10 }}>
          <select value={toOutlet} onChange={e => setToOutlet(e.target.value)} style={S.input}>
            <option value="">— Outlet tujuan —</option>
            {outlets.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <input value={poRef} onChange={e => setPoRef(e.target.value)} placeholder="No. PO (opsional)" style={S.input} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: 8, marginTop: 8 }}>
          <select value={pickId} onChange={e => setPickId(e.target.value)} style={S.input}>
            <option value="">— Pilih item —</option>
            {items.map(it => <option key={it.id} value={it.id}>{it.item_name} ({it.unit})</option>)}
          </select>
          <input value={pickQty} onChange={e => setPickQty(e.target.value)} placeholder="Qty" type="number" style={S.input} />
          <button onClick={addLine} style={S.btnGhost}>+ Tambah</button>
        </div>
        {lines.length > 0 && (
          <div style={{ marginTop: 8, background: "#0a0e16", border: "1px solid #21262d", borderRadius: 7, padding: "6px 10px" }}>
            {lines.map((l, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#9da7b3", padding: "4px 0" }}>
                <span>{l.item_name}</span>
                <span>{l.qty} {l.unit}
                  <button onClick={() => setLines(lines.filter((_, j) => j !== i))} style={{ ...S.x, marginLeft: 8 }}>×</button>
                </span>
              </div>
            ))}
          </div>
        )}
        <button onClick={ship} style={{ ...S.btnPrimary, marginTop: 10 }}>🚚 Kirim ke Outlet</button>
      </div>

      {/* TERIMA */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>📥 BARANG DALAM PERJALANAN — {inTransit.length}</div>
        {inTransit.length === 0 ? (
          <div style={{ color: "#5b6470", fontSize: 13, padding: "12px 0" }}>Tidak ada pengiriman berjalan.</div>
        ) : inTransit.map(gd => (
          <div key={gd.id} style={{ border: "1px solid #21262d", borderRadius: 8, padding: 12, marginTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ color: "#e6edf3", fontWeight: 700, fontSize: 13 }}>{gd.gd_number} → {gd.to_outlet}</span>
              <span style={{ color: "#5b6470", fontSize: 11 }}>{gd.po_ref || "tanpa PO"} · {fmtDate(gd.shipped_at)}</span>
            </div>
            {gd.items.map(it => (
              <div key={it.id} style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1.3fr", gap: 8, alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: "#9da7b3" }}>{it.item_name} <span style={{ color: "#5b6470" }}>· kirim {it.qty_delivered} {it.unit}</span></span>
                <input type="number" placeholder={"terima (" + it.qty_delivered + ")"}
                  value={(recv[gd.id] && recv[gd.id][it.id] && recv[gd.id][it.id].qty) ?? ""}
                  onChange={e => setRF(gd.id, it.id, "qty", e.target.value)} style={S.inputSm} />
                <input type="date" title="Tanggal expired barang"
                  value={(recv[gd.id] && recv[gd.id][it.id] && recv[gd.id][it.id].exp) || ""}
                  onChange={e => setRF(gd.id, it.id, "exp", e.target.value)} style={S.inputSm} />
              </div>
            ))}
            <button onClick={() => receive(gd)} style={{ ...S.btnReceive, marginTop: 6 }}>✓ Terima Barang — Stok Naik</button>
          </div>
        ))}
      </div>

      {/* RIWAYAT — diterima (bisa ditutup) & ditutup */}
      {(received.length + closed.length) > 0 && (
        <div style={{ ...S.card, marginTop: 14 }}>
          <div style={S.kicker}>✅ DITERIMA & DITUTUP — {received.length + closed.length}</div>
          {[...received, ...closed].slice(0, 16).map(gd => (
            <div key={gd.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, padding: "8px 0", borderTop: "1px solid #161b22", color: "#9da7b3" }}>
              <span>{gd.gd_number} → {gd.to_outlet} <span style={{ color: "#5b6470" }}>· {gd.items.length} item</span></span>
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {gd.status === "closed"
                  ? <span style={{ color: "#5b6470", fontWeight: 700, fontFamily: "'Geist Mono',monospace", fontSize: 11 }}>🔒 DITUTUP</span>
                  : <>
                      <span style={{ color: "#10b981" }}>✓ diterima {fmtDate(gd.received_at)}</span>
                      <button onClick={() => closeGd(gd)} style={S.btnClose}>🔒 Tutup GD</button>
                    </>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Geist Mono',monospace" },
  input: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 7, padding: "8px 10px", color: "#e6edf3", fontSize: 13, fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box" },
  inputSm: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 6, padding: "6px 8px", color: "#e6edf3", fontSize: 12, fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box" },
  btnPrimary: { background: "#06B6D4", color: "#04141a", border: "none", borderRadius: 7, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnReceive: { background: "#10b981", color: "#04130d", border: "none", borderRadius: 7, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnGhost: { background: "#161b22", color: "#e6edf3", border: "1px solid #21262d", borderRadius: 7, padding: "8px 14px", fontSize: 13, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
  x: { background: "transparent", border: "none", color: "#f87171", fontSize: 14, cursor: "pointer" },
  btnClose: { background: "#161b22", color: "#9da7b3", border: "1px solid #21262d", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
};
