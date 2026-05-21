// src/offline.js
// Mode offline — POS & kiosk tetap jalan pas internet putus, sales gak loss.
//
// Cara kerja: patch window.fetch SEKALI (dipanggil di main.jsx). Kalau
// transaksi (POST /api/orders) dikirim pas offline / koneksi gagal →
// transaksi di-antri di localStorage + dikasih ID lokal "OFF-...", flow
// POS tetap lanjut (struk tetap kecetak). Pas internet balik → antrian
// otomatis di-sync ke server.
//
// Catatan: pembayaran non-tunai (QRIS/gateway) tetap butuh internet —
// offline = transaksi tunai.

const QKEY = 'offline_order_queue';
const listeners = new Set();
let _origFetch = null;

const readQ = () => { try { return JSON.parse(localStorage.getItem(QKEY) || '[]'); } catch { return []; } };
const writeQ = (q) => { try { localStorage.setItem(QKEY, JSON.stringify(q)); } catch {} emit(); };

function emit() { listeners.forEach(fn => { try { fn(); } catch {} }); }

// ─── API publik buat komponen UI ───
export const isOffline = () => !navigator.onLine;
export const queueCount = () => readQ().length;
export function onOfflineChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

const isOrderCreate = (url, method) => method === 'POST' && /\/api\/orders(\?.*)?$/.test(url || '');
const synthOrder = (body, localId) => ({
  ...body, id: localId, _offline: true, status: body.status || 'waiting', time: Date.now(),
});

function enqueue(url, body) {
  const localId = 'OFF-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  const q = readQ();
  q.push({ localId, url, body, ts: Date.now() });
  writeQ(q);
  return localId;
}

// Sync antrian ke server (dipanggil pas online / berkala)
export async function syncQueue() {
  if (!_origFetch || !navigator.onLine) return;
  for (const item of [...readQ()]) {
    try {
      const r = await _origFetch(item.url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.body),
      });
      if (r && r.ok) writeQ(readQ().filter(x => x.localId !== item.localId));
      else break;                          // server error — coba lagi nanti
    } catch { break; }                     // masih offline — stop
  }
}

export function installOffline() {
  if (_origFetch) return;                  // idempotent
  _origFetch = window.fetch.bind(window);

  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const method = ((init && init.method) || (typeof input === 'object' && input && input.method) || 'GET').toUpperCase();
    const orderCreate = isOrderCreate(url, method);

    // offline duluan → langsung antri, gak usah coba fetch
    if (orderCreate && !navigator.onLine) {
      let body = {}; try { body = JSON.parse(init && init.body); } catch {}
      return new Response(JSON.stringify(synthOrder(body, enqueue(url, body))),
        { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    try {
      return await _origFetch(input, init);
    } catch (e) {
      // koneksi putus di tengah jalan → transaksi tetap diselamatkan
      if (orderCreate) {
        let body = {}; try { body = JSON.parse(init && init.body); } catch {}
        return new Response(JSON.stringify(synthOrder(body, enqueue(url, body))),
          { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      throw e;
    }
  };

  window.addEventListener('online', () => { emit(); syncQueue(); });
  window.addEventListener('offline', emit);
  setInterval(() => { if (navigator.onLine && readQ().length) syncQueue(); }, 20000);
}
