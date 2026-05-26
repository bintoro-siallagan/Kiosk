// karyaOS — Cinema Price List Master
// Tier harga per outlet × studio_type × format × day × time-band.
// Resolution: NULL = wildcard; specificity score wins.
// "Cek Price" tool untuk admin test resolve rule yang akan dipakai.
import { useState, useEffect, useCallback } from "react";

const C = { card: "#0d1117", border: "#1b212c", sub: "#9ca3af", dim: "#5b6470" };
const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const ANY = "— Semua —";
const STUDIO_TYPES = ["Regular", "IMAX", "Premiere", "4DX"];
const FORMATS      = ["2D", "3D", "IMAX", "4DX"];
const DAY_TYPES    = [["weekday", "Hari kerja (Sen-Kam)"], ["weekend", "Akhir pekan (Jum-Min)"], ["holiday", "Libur"]];
const TIME_BANDS   = [["morning", "Pagi (<12:00)"], ["matinee", "Matinee (12-17)"], ["prime", "Prime (17-21)"], ["late", "Late (≥21)"]];
const empty = { outlet: "", studio_type: "", format: "", day_type: "", time_band: "", price: 0, is_active: 1, notes: "" };

export default function CinemaPriceList({ apiBase = "" }) {
  const base = (apiBase || "") + "/api/cinema";
  const [rows, setRows] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [filterOutlet, setFilterOutlet] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [toast, setToast] = useState(null);

  // Test resolver state
  const [test, setTest] = useState({ outlet: "", studio_type: "", format: "2D", date: "", time: "" });
  const [testResult, setTestResult] = useState(null);

  const showToast = (m, kind = "ok") => { setToast({ m, kind }); setTimeout(() => setToast(null), 2400); };

  const load = useCallback(async () => {
    const r = await fetch(`${base}/price-list${filterOutlet ? `?outlet=${encodeURIComponent(filterOutlet)}` : ""}`);
    const d = await r.json();
    setRows(d.rows || []);
    setOutlets(d.outlets || []);
    if (!test.outlet && d.outlets?.length) setTest(t => ({ ...t, outlet: d.outlets[0] }));
  }, [base, filterOutlet, test.outlet]);
  useEffect(() => { load(); }, [load]);

  const startNew = () => { setEditing("new"); setForm({ ...empty, outlet: filterOutlet || (outlets[0] || "") }); };
  const startEdit = (r) => { setEditing(r.id); setForm({ ...empty, ...r, studio_type: r.studio_type || "", format: r.format || "", day_type: r.day_type || "", time_band: r.time_band || "" }); };
  const cancel = () => { setEditing(null); setForm(empty); };

  async function save() {
    if (!form.outlet?.trim()) { showToast("Outlet wajib", "err"); return; }
    if (!form.price)          { showToast("Price wajib", "err"); return; }
    const body = { ...form, studio_type: form.studio_type || null, format: form.format || null, day_type: form.day_type || null, time_band: form.time_band || null };
    const url = editing === "new" ? `${base}/price-list` : `${base}/price-list/${editing}`;
    const method = editing === "new" ? "POST" : "PATCH";
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json();
    if (!d.ok) { showToast(d.error || "Gagal", "err"); return; }
    showToast(editing === "new" ? "Aturan dibuat" : "Aturan diperbarui");
    cancel(); load();
  }
  async function remove(r) {
    if (!window.confirm(`Hapus aturan #${r.id}?`)) return;
    await fetch(`${base}/price-list/${r.id}`, { method: "DELETE" });
    showToast("Aturan dihapus"); load();
  }
  async function toggleActive(r) {
    await fetch(`${base}/price-list/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_active: !r.is_active }) });
    load();
  }

  async function runResolve() {
    const params = new URLSearchParams();
    Object.entries(test).forEach(([k, v]) => v && params.set(k, v));
    const r = await fetch(`${base}/price-list/resolve?${params}`);
    const d = await r.json();
    setTestResult(d);
  }

  return (
    <div style={{ fontFamily: "'Inter',sans-serif", color: "#e6edf3" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14, marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 19, fontWeight: 700, letterSpacing: 1 }}>💲 Cinema Price List Master</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>Price per outlet × studio × format × day × waktu · Resolution: specificity score (NULL = wildcard).</div>
        </div>
        {!editing && <button onClick={startNew} style={B.add}>＋ Aturan harga</button>}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ fontSize: 11, color: C.dim, letterSpacing: 1 }}>FILTER OUTLET</label>
        <select value={filterOutlet} onChange={e => setFilterOutlet(e.target.value)} style={{ ...inp, width: 220 }}>
          <option value="">— Semua outlet —</option>
          {outlets.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>

      {editing && (
        <div style={{ background: C.card, border: "1px solid #a855f766", borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#d8b4fe", marginBottom: 10 }}>{editing === "new" ? "Aturan baru" : `Edit #${editing}`}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <Field label="Outlet"><input value={form.outlet} onChange={e => setForm({ ...form, outlet: e.target.value })} placeholder="Paskal / Trans Studio / ..." style={inp} /></Field>
            <Field label={`Studio type (${ANY} = semua)`}>
              <select value={form.studio_type} onChange={e => setForm({ ...form, studio_type: e.target.value })} style={inp}>
                <option value="">{ANY}</option>
                {STUDIO_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label={`Format (${ANY} = semua)`}>
              <select value={form.format} onChange={e => setForm({ ...form, format: e.target.value })} style={inp}>
                <option value="">{ANY}</option>
                {FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </Field>
            <Field label={`Hari (${ANY} = semua)`}>
              <select value={form.day_type} onChange={e => setForm({ ...form, day_type: e.target.value })} style={inp}>
                <option value="">{ANY}</option>
                {DAY_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label={`Time-band (${ANY} = semua)`}>
              <select value={form.time_band} onChange={e => setForm({ ...form, time_band: e.target.value })} style={inp}>
                <option value="">{ANY}</option>
                {TIME_BANDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="Price (Rp)"><input type="number" value={form.price} onChange={e => setForm({ ...form, price: parseInt(e.target.value, 10) || 0 })} style={inp} /></Field>
            <Field label="Notes" wide><input value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} style={inp} /></Field>
            <Field label="Status">
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={!!form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked ? 1 : 0 })} /> Aktif
              </label>
            </Field>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button onClick={save} style={B.save}>{editing === "new" ? "Create" : "Save"}</button>
            <button onClick={cancel} style={B.cancel}>Cancel</button>
          </div>
        </div>
      )}

      {/* Resolver test panel */}
      <div style={{ background: "#0a0e16", border: `1px dashed ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 16 }}>
        <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 11, color: "#22d3ee", letterSpacing: 1.5, fontWeight: 700, marginBottom: 8 }}>🧮 CEK HARGA (RESOLVE TEST)</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr auto", gap: 8, alignItems: "flex-end" }}>
          <Field label="Outlet">
            <select value={test.outlet} onChange={e => setTest({ ...test, outlet: e.target.value })} style={inp}>
              {outlets.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Studio">
            <select value={test.studio_type} onChange={e => setTest({ ...test, studio_type: e.target.value })} style={inp}>
              <option value="">— Any —</option>
              {STUDIO_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Format">
            <select value={test.format} onChange={e => setTest({ ...test, format: e.target.value })} style={inp}>
              <option value="">— Any —</option>
              {FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>
          <Field label="Date"><input type="date" value={test.date} onChange={e => setTest({ ...test, date: e.target.value })} style={inp} /></Field>
          <Field label="Time"><input type="time" value={test.time} onChange={e => setTest({ ...test, time: e.target.value })} style={inp} /></Field>
          <button onClick={runResolve} style={{ ...B.save, padding: "8px 16px" }}>Cek →</button>
        </div>
        {testResult && (
          <div style={{ marginTop: 12, padding: "10px 14px", background: testResult.price ? "#10b98115" : "#ef444415", border: `1px solid ${testResult.price ? "#10b98144" : "#ef444444"}`, borderRadius: 10 }}>
            {testResult.price ? (
              <>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#10b981", fontFamily: "'Geist Mono',monospace" }}>{rp(testResult.price)}</div>
                <div style={{ fontSize: 11, color: C.sub, marginTop: 3 }}>
                  Match #{testResult.rule.id} · {testResult.rule.notes || (resolveLabel(testResult.rule))}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 13, color: "#fca5a5" }}>None aturan yang cocok. Tambah aturan fallback default.</div>
            )}
          </div>
        )}
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <Header cols={["OUTLET", "STUDIO", "FORMAT", "HARI", "TIME", "HARGA", "CATATAN", "STATUS", "AKSI"]} widths={[140, 90, 60, 100, 90, 110, "auto", 70, 110]} />
        {rows.length === 0 ? <Empty>None aturan harga di filter ini.</Empty> :
          rows.map(r => (
            <div key={r.id} style={rowS}>
              <span style={{ width: 140, fontWeight: 700, fontSize: 13 }}>{r.outlet}</span>
              <span style={{ width: 90, fontSize: 12, color: r.studio_type ? "#fff" : C.dim }}>{r.studio_type || "*"}</span>
              <span style={{ width: 60, fontSize: 12, color: r.format ? "#fff" : C.dim, fontFamily: "'Geist Mono',monospace" }}>{r.format || "*"}</span>
              <span style={{ width: 100, fontSize: 12, color: r.day_type ? "#fff" : C.dim }}>{r.day_type || "*"}</span>
              <span style={{ width: 90, fontSize: 12, color: r.time_band ? "#fff" : C.dim }}>{r.time_band || "*"}</span>
              <span style={{ width: 110, fontFamily: "'Geist Mono',monospace", color: "#10b981", fontWeight: 700 }}>{rp(r.price)}</span>
              <span style={{ flex: 1, fontSize: 11.5, color: C.sub }}>{r.notes || "—"}</span>
              <span style={{ width: 70 }}>{r.is_active ? <span style={pillG}>aktif</span> : <span style={pillX}>off</span>}</span>
              <span style={{ width: 110, display: "flex", gap: 4, justifyContent: "flex-end" }}>
                <button onClick={() => toggleActive(r)} style={B.small(r.is_active ? "#6b7280" : "#10b981")}>{r.is_active ? "Off" : "On"}</button>
                <button onClick={() => startEdit(r)} style={B.small("#a855f7")}>Edit</button>
                <button onClick={() => remove(r)} style={B.small("#ef4444")}>×</button>
              </span>
            </div>
          ))
        }
      </div>

      {toast && (
        <div style={{
          position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
          background: toast.kind === "err" ? "#7f1d1d" : "#14532d",
          border: `1px solid ${toast.kind === "err" ? "#ef4444" : "#22c55e"}`,
          color: "#fff", padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 9999,
        }}>{toast.m}</div>
      )}
    </div>
  );
}

function resolveLabel(r) {
  return [r.studio_type || "*", r.format || "*", r.day_type || "*", r.time_band || "*"].join(" / ");
}
function Field({ label, children, wide }) {
  return (
    <div style={{ gridColumn: wide ? "span 2" : "auto" }}>
      <div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, fontFamily: "'Geist Mono',monospace", marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}
function Header({ cols, widths }) {
  return (
    <div style={{ ...rowS, color: C.dim, fontSize: 11, letterSpacing: 1, padding: "8px 14px", borderBottom: `1px solid ${C.border}` }}>
      {cols.map((c, i) => <span key={i} style={{ width: widths[i] === "auto" ? "auto" : widths[i], flex: widths[i] === "auto" ? 1 : "none" }}>{c}</span>)}
    </div>
  );
}
function Empty({ children }) { return <div style={{ padding: "22px 14px", textAlign: "center", color: C.sub, fontSize: 13 }}>{children}</div>; }
const rowS = { display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" };
const inp = { width: "100%", padding: "8px 11px", background: "#0a0e16", border: `1px solid ${C.border}`, borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" };
const pillG = { background: "#10b98122", color: "#10b981", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600 };
const pillX = { background: "#6b728022", color: "#9ca3af", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600 };
const B = {
  add:    { background: "#a855f72a", border: "1px solid #a855f766", color: "#d8b4fe", padding: "9px 18px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  save:   { background: "#10b981", border: "none", color: "#04130c", padding: "9px 20px", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  cancel: { background: "#1b212c", border: "1px solid #2a2b30", color: "#9ca3af", padding: "9px 18px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  small: (color) => ({ background: color + "18", border: `1px solid ${color}44`, color, padding: "4px 9px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }),
};
