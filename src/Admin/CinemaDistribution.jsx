// karyaOS — Cinema Film Distribution & Settlement
// 3 tabs: Distributor (CRUD) · Lisensi per Film (distributor + license + tiered share)
// · Settlement & Recon (auto-recon by tier — finance/management ready).
import { useState, useEffect, useCallback } from "react";

const C = { card: "#0d1117", border: "#1b212c", sub: "#9ca3af", dim: "#5b6470", text: "#e6edf3" };
const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const pct = (n) => `${(Math.round((n || 0) * 100) / 100).toFixed(2)}%`;
const TABS = [["distributor", "🏢 Distributor"], ["license", "📜 Lisensi per Film"], ["settlement", "💹 Settlement & Recon"]];
const PERIODS = [
  { id: "today",     label: "Hari ini" },
  { id: "week",      label: "7 day" },
  { id: "month",     label: "30 day" },
  { id: "ytd",       label: "YTD" },
];
function periodRange(p) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const ymd = (d) => d.toISOString().slice(0, 10);
  if (p === "today") return { from: ymd(today), to: ymd(today) };
  if (p === "week")  { const f = new Date(today); f.setDate(f.getDate() - 6); return { from: ymd(f), to: ymd(today) }; }
  if (p === "month") { const f = new Date(today); f.setDate(f.getDate() - 29); return { from: ymd(f), to: ymd(today) }; }
  const y = new Date(today); y.setMonth(0); y.setDate(1); return { from: ymd(y), to: ymd(today) };
}

export default function CinemaDistribution({ apiBase = "" }) {
  const base = (apiBase || "") + "/api/cinema";
  const [tab, setTab] = useState("distributor");
  const [toast, setToast] = useState(null);
  const showToast = (m, kind = "ok") => { setToast({ m, kind }); setTimeout(() => setToast(null), 2400); };
  return (
    <div style={{ fontFamily: "'Inter',sans-serif", color: C.text }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 19, fontWeight: 700, letterSpacing: 1 }}>🎬 Film Distribution &amp; Settlement</div>
        <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>Distributor master · lisensi per film (tiered share) · auto-recon finance.</div>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ background: tab === id ? "#a855f72a" : "transparent", border: `1px solid ${tab === id ? "#a855f766" : C.border}`, borderRadius: 8, padding: "8px 14px", color: tab === id ? "#fff" : C.sub, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{label}</button>
        ))}
      </div>

      {tab === "distributor"  && <DistributorTab base={base} showToast={showToast} />}
      {tab === "license"      && <LicenseTab    base={base} showToast={showToast} />}
      {tab === "settlement"   && <SettlementTab base={base} />}

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

// ── TAB: Distributor CRUD ──
function DistributorTab({ base, showToast }) {
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const load = useCallback(async () => {
    const r = await fetch(`${base}/distributors?all=1`); const d = await r.json();
    setRows(d.distributors || []);
  }, [base]);
  useEffect(() => { load(); }, [load]);
  const startNew = () => { setEditing("new"); setForm({ vat_pct: 11, is_active: 1 }); };
  const startEdit = (r) => { setEditing(r.id); setForm({ ...r }); };
  const cancel = () => { setEditing(null); setForm({}); };
  const save = async () => {
    if (!form.name?.trim()) { showToast("Nama wajib", "err"); return; }
    const url = editing === "new" ? `${base}/distributors` : `${base}/distributors/${editing}`;
    const method = editing === "new" ? "POST" : "PATCH";
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const d = await r.json();
    if (!d.ok) { showToast(d.error || "Gagal simpan", "err"); return; }
    showToast(editing === "new" ? "Distributor dibuat" : "Distributor diperbarui");
    cancel(); load();
  };
  const remove = async (r) => {
    if (!window.confirm(`Hapus ${r.name}? Film yang terkait akan di-unlink.`)) return;
    await fetch(`${base}/distributors/${r.id}`, { method: "DELETE" });
    showToast("Distributor dihapus"); load();
  };
  return (
    <>
      <div style={{ marginBottom: 12 }}>
        {!editing && <button onClick={startNew} style={B.add}>＋ Distributor baru</button>}
      </div>
      {editing && (
        <div style={{ background: C.card, border: "1px solid #a855f766", borderRadius: 14, padding: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#d8b4fe", marginBottom: 10 }}>{editing === "new" ? "Distributor baru" : `Edit #${editing}`}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Nama distributor"><input value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="PT. Multivision Plus Picture" style={inp} /></Field>
            <Field label="Kode"><input value={form.code || ""} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="MVP" style={inp} /></Field>
            <Field label="Kontak"><input value={form.contact_person || ""} onChange={e => setForm({ ...form, contact_person: e.target.value })} style={inp} /></Field>
            <Field label="Email"><input value={form.contact_email || ""} onChange={e => setForm({ ...form, contact_email: e.target.value })} style={inp} /></Field>
            <Field label="Telepon"><input value={form.contact_phone || ""} onChange={e => setForm({ ...form, contact_phone: e.target.value })} style={inp} /></Field>
            <Field label="VAT % (default 11)"><input type="number" step="0.01" value={form.vat_pct ?? 11} onChange={e => setForm({ ...form, vat_pct: parseFloat(e.target.value) || 0 })} style={inp} /></Field>
            <Field label="Alamat" wide><input value={form.address || ""} onChange={e => setForm({ ...form, address: e.target.value })} style={inp} /></Field>
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
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <Header cols={["DISTRIBUTOR", "KODE", "VAT", "KONTAK", "STATUS", "AKSI"]} widths={[260, 70, 70, 280, 70, 140]} />
        {rows.length === 0 ? <Empty>No distributor.</Empty> :
          rows.map(r => (
            <div key={r.id} style={rowS}>
              <span style={{ width: 260, fontWeight: 700, fontSize: 13 }}>{r.name}</span>
              <span style={{ width: 70, fontFamily: "'Geist Mono',monospace", fontSize: 12, color: C.sub }}>{r.code || "—"}</span>
              <span style={{ width: 70, fontFamily: "'Geist Mono',monospace", fontSize: 12, color: C.sub }}>{r.vat_pct || 0}%</span>
              <span style={{ width: 280, fontSize: 12, color: C.sub }}>
                {r.contact_person ? <>{r.contact_person}<br /></> : null}
                <span style={{ color: C.dim, fontSize: 11 }}>{r.contact_email || ""}{r.contact_phone ? " · " + r.contact_phone : ""}</span>
              </span>
              <span style={{ width: 70 }}>{r.is_active ? <span style={pillG}>aktif</span> : <span style={pillX}>off</span>}</span>
              <span style={{ width: 140, display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button onClick={() => startEdit(r)} style={B.small("#a855f7")}>Edit</button>
                <button onClick={() => remove(r)} style={B.small("#ef4444")}>×</button>
              </span>
            </div>
          ))
        }
      </div>
    </>
  );
}

// ── TAB: License per Film (distributor link + license dates + tiered share) ──
function LicenseTab({ base, showToast }) {
  const [films, setFilms] = useState([]);
  const [distributors, setDistributors] = useState([]);
  const [picked, setPicked] = useState(null);  // film_id
  const [filmForm, setFilmForm] = useState({});
  const [tiers, setTiers] = useState([]);
  const [tierForm, setTierForm] = useState({ week_from: 1, week_to: "", cinema_pct: 50, distributor_pct: 50 });
  const loadFilms = useCallback(async () => {
    const r = await fetch(`${base}/films`); const d = await r.json();
    setFilms(d.films || []);
  }, [base]);
  const loadDistributors = useCallback(async () => {
    const r = await fetch(`${base}/distributors?all=1`); const d = await r.json();
    setDistributors(d.distributors || []);
  }, [base]);
  const loadTiers = useCallback(async () => {
    if (!picked) { setTiers([]); return; }
    const r = await fetch(`${base}/films/${picked}/share-tiers`); const d = await r.json();
    setTiers(d.tiers || []);
  }, [base, picked]);
  useEffect(() => { loadFilms(); loadDistributors(); }, [loadFilms, loadDistributors]);
  useEffect(() => { loadTiers(); }, [loadTiers]);
  useEffect(() => {
    const f = films.find(x => x.id === picked);
    setFilmForm(f ? {
      distributor_id: f.distributor_id || "",
      license_start: f.license_start || "",
      license_end: f.license_end || "",
      revenue_share_pct: f.revenue_share_pct || 0,
      min_run_days: f.min_run_days || 0,
      distributor_notes: f.distributor_notes || "",
    } : {});
  }, [picked, films]);

  const saveFilmLicense = async () => {
    if (!picked) return;
    const r = await fetch(`${base}/films/${picked}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(filmForm) });
    const d = await r.json();
    if (!d.ok) { showToast(d.error || "Gagal", "err"); return; }
    showToast("Lisensi film disimpan");
    loadFilms();
  };

  const addTier = async () => {
    const body = {
      week_from: parseInt(tierForm.week_from, 10) || 1,
      week_to:   tierForm.week_to === "" ? null : parseInt(tierForm.week_to, 10),
      cinema_pct: parseFloat(tierForm.cinema_pct) || 0,
      distributor_pct: parseFloat(tierForm.distributor_pct) || 0,
    };
    const r = await fetch(`${base}/films/${picked}/share-tiers`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json();
    if (!d.ok) { showToast(d.error || "Gagal", "err"); return; }
    showToast("Tier ditambahkan"); loadTiers();
  };
  const seedStandard = async () => {
    if (!window.confirm("Reset tiers to standar Indo: W1 50/50 · W2 60/40 · W3+ 70/30?")) return;
    const r = await fetch(`${base}/films/${picked}/share-tiers/seed-standard`, { method: "POST" });
    const d = await r.json();
    if (!d.ok) { showToast(d.error || "Gagal", "err"); return; }
    showToast("Template standar dibuat"); loadTiers();
  };
  const removeTier = async (id) => {
    await fetch(`${base}/share-tiers/${id}`, { method: "DELETE" }); loadTiers();
  };

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 14 }}>
        {/* Film picker */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 8, maxHeight: 540, overflowY: "auto" }}>
          <div style={{ fontSize: 11, color: C.dim, letterSpacing: 1, padding: "8px 10px", fontFamily: "'Geist Mono',monospace" }}>FILM CATALOG</div>
          {films.map(f => (
            <button key={f.id} onClick={() => setPicked(f.id)}
              style={{
                width: "100%", textAlign: "left", padding: "10px 12px", marginBottom: 4,
                background: picked === f.id ? "#a855f72a" : "transparent",
                border: `1px solid ${picked === f.id ? "#a855f766" : "transparent"}`,
                borderRadius: 8, cursor: "pointer", color: C.text, fontFamily: "inherit",
              }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{f.title}</div>
              <div style={{ fontSize: 11, color: C.sub }}>{f.distributor_name ? `🏢 ${f.distributor_name}` : "No distributor"}</div>
            </button>
          ))}
        </div>

        {/* Right pane */}
        {!picked ? (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "40px 18px", textAlign: "center", color: C.sub, fontSize: 13 }}>
            Pilih film dari kiri untuk atur distributor &amp; tiered share.
          </div>
        ) : (
          <div>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: "#a78bfa", letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", fontWeight: 700, marginBottom: 10 }}>LISENSI FILM</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <Field label="Distributor">
                  <select value={filmForm.distributor_id || ""} onChange={e => setFilmForm({ ...filmForm, distributor_id: e.target.value || null })} style={inp}>
                    <option value="">— Pilih —</option>
                    {distributors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </Field>
                <Field label="Lisensi mulai"><input type="date" value={filmForm.license_start || ""} onChange={e => setFilmForm({ ...filmForm, license_start: e.target.value })} style={inp} /></Field>
                <Field label="Lisensi akhir"><input type="date" value={filmForm.license_end || ""} onChange={e => setFilmForm({ ...filmForm, license_end: e.target.value })} style={inp} /></Field>
                <Field label="Min. run days"><input type="number" value={filmForm.min_run_days || 0} onChange={e => setFilmForm({ ...filmForm, min_run_days: parseInt(e.target.value, 10) || 0 })} style={inp} /></Field>
                <Field label="Fallback share % (flat — kalau tiers kosong)"><input type="number" step="0.1" value={filmForm.revenue_share_pct || 0} onChange={e => setFilmForm({ ...filmForm, revenue_share_pct: parseFloat(e.target.value) || 0 })} style={inp} /></Field>
                <Field label="Notes"><input value={filmForm.distributor_notes || ""} onChange={e => setFilmForm({ ...filmForm, distributor_notes: e.target.value })} style={inp} /></Field>
              </div>
              <div style={{ marginTop: 12 }}>
                <button onClick={saveFilmLicense} style={B.save}>Simpan lisensi</button>
              </div>
            </div>

            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 12, color: "#fbbf24", letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", fontWeight: 700 }}>TIERED REVENUE SHARE</div>
                <button onClick={seedStandard} style={B.small("#10b981")}>+ Template Standar (W1 50/50 · W2 60/40 · W3+ 70/30)</button>
              </div>
              {tiers.length === 0 ? <div style={{ padding: "16px 0", color: C.sub, fontSize: 13, textAlign: "center" }}>No tier. Klik "+ Template Standar" or buat manual.</div> :
                <div style={{ marginBottom: 12 }}>
                  <Header cols={["MINGGU", "CINEMA %", "DISTRIBUTOR %", "CATATAN", "AKSI"]} widths={[120, 100, 130, "auto", 70]} />
                  {tiers.map(t => (
                    <div key={t.id} style={rowS}>
                      <span style={{ width: 120, fontFamily: "'Geist Mono',monospace", fontSize: 13 }}>W{t.week_from}{t.week_to ? `–W${t.week_to}` : "+"}</span>
                      <span style={{ width: 100, fontFamily: "'Geist Mono',monospace", color: "#10b981", fontWeight: 700 }}>{t.cinema_pct}%</span>
                      <span style={{ width: 130, fontFamily: "'Geist Mono',monospace", color: "#fbbf24", fontWeight: 700 }}>{t.distributor_pct}%</span>
                      <span style={{ flex: 1, fontSize: 12, color: C.sub }}>{t.notes || "—"}</span>
                      <span style={{ width: 70, textAlign: "right" }}>
                        <button onClick={() => removeTier(t.id)} style={B.small("#ef4444")}>×</button>
                      </span>
                    </div>
                  ))}
                </div>
              }
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
                <div style={{ fontSize: 11, color: C.dim, letterSpacing: 1, marginBottom: 6 }}>TAMBAH TIER MANUAL</div>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                  <Field label="Minggu dari"><input type="number" min="1" value={tierForm.week_from} onChange={e => setTierForm({ ...tierForm, week_from: e.target.value })} style={{ ...inp, width: 100 }} /></Field>
                  <Field label="Minggu sampai (kosong = +)"><input type="number" value={tierForm.week_to} onChange={e => setTierForm({ ...tierForm, week_to: e.target.value })} placeholder="kosong = open" style={{ ...inp, width: 160 }} /></Field>
                  <Field label="Cinema %"><input type="number" step="0.01" value={tierForm.cinema_pct} onChange={e => { const v = parseFloat(e.target.value) || 0; setTierForm({ ...tierForm, cinema_pct: v, distributor_pct: +(100 - v).toFixed(2) }); }} style={{ ...inp, width: 110 }} /></Field>
                  <Field label="Distributor %"><input type="number" step="0.01" value={tierForm.distributor_pct} onChange={e => { const v = parseFloat(e.target.value) || 0; setTierForm({ ...tierForm, distributor_pct: v, cinema_pct: +(100 - v).toFixed(2) }); }} style={{ ...inp, width: 130 }} /></Field>
                  <button onClick={addTier} style={B.save}>+ Tier</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── TAB: Settlement (auto-recon) ──
function SettlementTab({ base }) {
  const [period, setPeriod] = useState("month");
  const [data, setData] = useState(null);
  const load = useCallback(async () => {
    const { from, to } = periodRange(period);
    const r = await fetch(`${base}/distribution/settlement?from=${from}&to=${to}`);
    const d = await r.json();
    setData(d);
  }, [base, period]);
  useEffect(() => { load(); }, [load]);
  const t = data?.totals || {};
  return (
    <>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {PERIODS.map(p => (
          <button key={p.id} onClick={() => setPeriod(p.id)}
            style={{ background: period === p.id ? "#a855f72a" : "transparent", border: `1px solid ${period === p.id ? "#a855f766" : C.border}`, borderRadius: 8, padding: "7px 14px", color: period === p.id ? "#fff" : C.sub, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{p.label}</button>
        ))}
        <span style={{ flex: 1 }} />
        <button onClick={load} style={{ ...B.small("#22d3ee"), padding: "8px 14px" }}>↻ Refresh</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10, marginBottom: 14 }}>
        <Stat label="Tiket terjual" value={t.tickets || 0} color="#22d3ee" />
        <Stat label="Gross"          value={rp(t.gross)}   color="#a855f7" />
        <Stat label="VAT"            value={rp(t.vat)}     color="#9ca3af" />
        <Stat label="Net (gross−VAT)" value={rp(t.net)}    color="#10b981" />
        <Stat label="Royalti distributor" value={rp(t.royalty)} color="#fbbf24" />
      </div>

      <Section title="PER DISTRIBUTOR">
        {!data || data.by_distributor.length === 0 ? <Empty>None data.</Empty> : (
          <>
            <Header cols={["DISTRIBUTOR", "TKT", "NET", "ROYALTI", "CINEMA SHARE"]} widths={[300, 70, 130, 140, 140]} />
            {data.by_distributor.map((r, i) => (
              <div key={i} style={rowS}>
                <span style={{ width: 300, fontWeight: 700 }}>{r.distributor_name}<span style={{ color: C.dim, fontWeight: 400, marginLeft: 6, fontSize: 11 }}>{r.distributor_code}</span></span>
                <span style={{ width: 70, fontFamily: "'Geist Mono',monospace", color: C.sub }}>{r.tickets}</span>
                <span style={{ width: 130, fontFamily: "'Geist Mono',monospace", color: "#10b981", fontWeight: 700 }}>{rp(r.net)}</span>
                <span style={{ width: 140, fontFamily: "'Geist Mono',monospace", color: "#fbbf24", fontWeight: 700 }}>{rp(r.royalty)}</span>
                <span style={{ width: 140, fontFamily: "'Geist Mono',monospace", color: "#a855f7", fontWeight: 700 }}>{rp(r.cinema_share)}</span>
              </div>
            ))}
          </>
        )}
      </Section>

      <Section title="PER FILM">
        {!data || data.by_film.length === 0 ? <Empty>None data.</Empty> : (
          <>
            <Header cols={["FILM", "DISTRIBUTOR", "TKT", "NET", "ROYALTI", "CINEMA"]} widths={[230, 200, 70, 130, 130, 130]} />
            {data.by_film.map((r, i) => (
              <div key={i} style={rowS}>
                <span style={{ width: 230, fontWeight: 700, fontSize: 12.5 }}>{r.film_title}</span>
                <span style={{ width: 200, fontSize: 12, color: C.sub }}>{r.distributor_name}</span>
                <span style={{ width: 70, fontFamily: "'Geist Mono',monospace", color: C.sub }}>{r.tickets}</span>
                <span style={{ width: 130, fontFamily: "'Geist Mono',monospace", color: "#10b981" }}>{rp(r.net)}</span>
                <span style={{ width: 130, fontFamily: "'Geist Mono',monospace", color: "#fbbf24", fontWeight: 700 }}>{rp(r.royalty)}</span>
                <span style={{ width: 130, fontFamily: "'Geist Mono',monospace", color: "#a855f7", fontWeight: 700 }}>{rp(r.cinema_share)}</span>
              </div>
            ))}
          </>
        )}
      </Section>

      <Section title="PER TIER (BREAKDOWN AUDIT / RECON)">
        {!data || data.by_tier.length === 0 ? <Empty>None data.</Empty> : (
          <>
            <Header cols={["FILM × DISTRIBUTOR", "TIER", "TKT", "NET", "ROYALTI", "CINEMA"]} widths={[300, 180, 60, 130, 130, 130]} />
            {data.by_tier.map((r, i) => (
              <div key={i} style={rowS}>
                <span style={{ width: 300, fontSize: 12.5 }}>
                  <div style={{ fontWeight: 700 }}>{r.film_title}</div>
                  <div style={{ fontSize: 11, color: C.sub }}>{r.distributor_name}</div>
                </span>
                <span style={{ width: 180, fontFamily: "'Geist Mono',monospace", fontSize: 11.5 }}>{r.tier_label}</span>
                <span style={{ width: 60, fontFamily: "'Geist Mono',monospace", color: C.sub }}>{r.tickets}</span>
                <span style={{ width: 130, fontFamily: "'Geist Mono',monospace", color: "#10b981" }}>{rp(r.net)}</span>
                <span style={{ width: 130, fontFamily: "'Geist Mono',monospace", color: "#fbbf24", fontWeight: 700 }}>{rp(r.royalty)}</span>
                <span style={{ width: 130, fontFamily: "'Geist Mono',monospace", color: "#a855f7", fontWeight: 700 }}>{rp(r.cinema_share)}</span>
              </div>
            ))}
          </>
        )}
      </Section>
    </>
  );
}

// ── Helpers / styles ──
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
function Empty({ children }) {
  return <div style={{ padding: "22px 14px", textAlign: "center", color: C.sub, fontSize: 13 }}>{children}</div>;
}
function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, color: C.dim, letterSpacing: 1, fontFamily: "'Geist Mono',monospace", marginBottom: 8 }}>{title}</div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>{children}</div>
    </div>
  );
}
function Stat({ label, value, color }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px" }}>
      <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 17, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 10, color: C.dim, letterSpacing: 0.5, marginTop: 2 }}>{label}</div>
    </div>
  );
}

const rowS = { display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" };
const inp = { width: "100%", padding: "8px 11px", background: "#0a0e16", border: `1px solid ${C.border}`, borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" };
const pillG = { background: "#10b98122", color: "#10b981", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600 };
const pillX = { background: "#6b728022", color: "#9ca3af", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600 };
const B = {
  add:    { background: "#a855f72a", border: "1px solid #a855f766", color: "#d8b4fe", padding: "9px 18px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  save:   { background: "#10b981", border: "none", color: "#04130c", padding: "9px 20px", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  cancel: { background: "#1b212c", border: "1px solid #2a2b30", color: "#9ca3af", padding: "9px 18px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  small: (color) => ({ background: color + "18", border: `1px solid ${color}44`, color, padding: "4px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }),
};
