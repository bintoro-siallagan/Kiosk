// karyaOS — Cinema Seat Types Manager
// Per studio: tandai kursi sebagai Regular / Couple / VIP / Disabled.
// Couple = sepasang (mis A1+A2 dianggap satu unit). VIP = harga lebih.
// Disabled = aksesibilitas (front row biasa). Berlaku global, dipakai oleh
// kiosk customer + admin ticketing untuk render warna seat map.
import { useState, useEffect, useCallback } from "react";

const C = { card: "#0d1117", border: "#1b212c", sub: "#9ca3af", dim: "#5b6470" };
const TYPES = [
  ["regular",  "Regular",  "#1b212c", "#7d8590"],
  ["couple",   "Couple",   "#ec489922", "#ec4899"],
  ["vip",      "VIP",      "#f59e0b22", "#fbbf24"],
  ["disabled", "Disabled", "#06b6d422", "#06b6d4"],
];

export default function CinemaSeatTypes({ apiBase = "" }) {
  const base = (apiBase || "") + "/api/cinema";
  const [studios, setStudios] = useState([]);
  const [picked, setPicked] = useState(null);
  const [assignments, setAssignments] = useState({});  // { seat: { seat_type, price_modifier } }
  const [paintType, setPaintType] = useState("vip");
  const [paintModifier, setPaintModifier] = useState(0);
  const [toast, setToast] = useState(null);
  const showToast = (m, kind = "ok") => { setToast({ m, kind }); setTimeout(() => setToast(null), 2400); };

  useEffect(() => {
    fetch(`${base}/studios`).then(r => r.json()).then(d => {
      setStudios(d.studios || []);
      if (!picked && d.studios?.length) setPicked(d.studios[0].id);
    }).catch(() => {});
  }, [base, picked]);

  const loadAssignments = useCallback(async () => {
    if (!picked) return;
    const r = await fetch(`${base}/studios/${picked}/seat-types`);
    const d = await r.json();
    const map = {};
    for (const a of (d.seat_types || [])) map[a.seat] = { seat_type: a.seat_type, price_modifier: a.price_modifier || 0 };
    setAssignments(map);
  }, [base, picked]);
  useEffect(() => { loadAssignments(); }, [loadAssignments]);

  const studio = studios.find(s => s.id === picked);
  const paint = (seat) => {
    setAssignments(prev => {
      const cur = prev[seat];
      const next = { ...prev };
      // If clicking same type → remove (back to regular)
      if (cur?.seat_type === paintType) delete next[seat];
      else next[seat] = { seat_type: paintType, price_modifier: paintModifier };
      return next;
    });
  };

  async function save() {
    const list = Object.entries(assignments).map(([seat, v]) => ({ seat, seat_type: v.seat_type, price_modifier: v.price_modifier || 0 }));
    const r = await fetch(`${base}/studios/${picked}/seat-types/bulk`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignments: list }),
    });
    const d = await r.json();
    if (!d.ok) { showToast(d.error || "Gagal", "err"); return; }
    showToast(`${list.length} kursi tersimpan`);
  }
  async function clearAll() {
    if (!window.confirm("Reset semua kursi to Regular?")) return;
    // Delete each non-regular assignment
    const seats = Object.keys(assignments);
    await Promise.all(seats.map(s => fetch(`${base}/studios/${picked}/seat-types/${s}`, { method: "DELETE" })));
    setAssignments({}); showToast("Semua di-reset");
  }

  return (
    <div style={{ fontFamily: "'Inter',sans-serif", color: "#e6edf3" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14, marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 19, fontWeight: 700, letterSpacing: 1 }}>💺 Cinema Seat Types</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>Tandai kursi Couple / VIP / Disabled per studio · price modifier opsional.</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ fontSize: 11, color: C.dim, letterSpacing: 1 }}>STUDIO</label>
        <select value={picked || ""} onChange={e => setPicked(parseInt(e.target.value, 10))} style={inp}>
          {studios.map(s => <option key={s.id} value={s.id}>{s.name} · {s.studio_type} · {s.rows}×{s.cols}</option>)}
        </select>
      </div>

      {studio && (
        <>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 12, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: 11, color: C.dim, letterSpacing: 1 }}>PAINT</label>
            {TYPES.map(([id, lbl, bg, fg]) => (
              <button key={id} onClick={() => setPaintType(id)}
                style={{ background: paintType === id ? bg : "transparent", border: `1px solid ${paintType === id ? fg : C.border}`, color: paintType === id ? fg : C.sub, padding: "7px 13px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{lbl}</button>
            ))}
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ fontSize: 11, color: C.dim, letterSpacing: 1 }}>SURCHARGE</label>
              <input type="number" value={paintModifier} onChange={e => setPaintModifier(parseInt(e.target.value, 10) || 0)} placeholder="+Rp" style={{ ...inp, width: 110 }} />
              <button onClick={save} style={B.save}>💾 Simpan ({Object.keys(assignments).length})</button>
              <button onClick={clearAll} style={B.danger}>Reset semua</button>
            </div>
          </div>

          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, overflowX: "auto" }}>
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <div style={{ height: 4, background: "linear-gradient(90deg,transparent,#a855f7,transparent)", borderRadius: 4, marginBottom: 4 }} />
              <span style={{ fontSize: 10, color: C.dim, letterSpacing: 3, fontFamily: "'Geist Mono',monospace" }}>L A Y A R</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
              {Array.from({ length: studio.rows }).map((_, ri) => {
                const letter = String.fromCharCode(65 + ri);
                return (
                  <div key={ri} style={{ display: "flex", gap: 5, alignItems: "center" }}>
                    <span style={{ width: 18, fontSize: 11, color: C.dim, fontFamily: "'Geist Mono',monospace" }}>{letter}</span>
                    {Array.from({ length: studio.cols }).map((_, ci) => {
                      const seat = `${letter}${ci + 1}`;
                      const a = assignments[seat];
                      const tinfo = TYPES.find(([t]) => t === (a?.seat_type || "regular")) || TYPES[0];
                      return (
                        <button key={ci} onClick={() => paint(seat)} title={seat + (a ? ` · ${a.seat_type}${a.price_modifier ? ` (+Rp${a.price_modifier})` : ""}` : "")}
                          style={{ width: 32, height: 32, borderRadius: 6, fontSize: 9.5, fontWeight: 700, fontFamily: "'Geist Mono',monospace",
                            background: tinfo[2], border: `1px solid ${tinfo[3]}55`, color: tinfo[3], cursor: "pointer" }}>{ci + 1}</button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 14, flexWrap: "wrap" }}>
              {TYPES.map(([id, lbl, bg, fg]) => (
                <span key={id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.sub }}>
                  <span style={{ width: 14, height: 14, background: bg, border: `1px solid ${fg}55`, borderRadius: 3 }} />{lbl}
                </span>
              ))}
            </div>
          </div>
        </>
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
          background: toast.kind === "err" ? "#7f1d1d" : "#14532d", border: `1px solid ${toast.kind === "err" ? "#ef4444" : "#22c55e"}`,
          color: "#fff", padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 9999 }}>{toast.m}</div>
      )}
    </div>
  );
}

const inp = { padding: "8px 11px", background: "#0a0e16", border: `1px solid ${C.border}`, borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" };
const B = {
  save:   { background: "#10b981", border: "none", color: "#04130c", padding: "8px 16px", borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  danger: { background: "#ef444418", border: "1px solid #ef444444", color: "#fca5a5", padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
};
