// ─── API CONFIG ───────────────────────────────────────────────────────────
const BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

// ─── REST API HELPERS ─────────────────────────────────────────────────────
async function req(method, path, body) {
  const token = localStorage.getItem("adminToken");
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

export const api = {
  // Orders
  getOrders:      ()           => req("GET",    "/api/orders"),
  getOrder:       (id)         => req("GET",    `/api/orders/${id}`),
  createOrder:    (data)       => req("POST",   "/api/orders", data),
  updateStatus:   (id, status) => req("PATCH",  `/api/orders/${id}/status`, { status }),
  cancelOrder:    (id)         => req("DELETE", `/api/orders/${id}`),

  // Menu
  getMenu:        ()           => req("GET",    "/api/menu"),
  getMenuConfig:  ()           => req("GET",    "/api/menu/config"),
  getAvailMenu:   ()           => req("GET",    "/api/menu/available"),
  updateMenu:     (id, data)   => req("PATCH",  `/api/menu/${id}`, data),

  // Stats
  getZReport: (d) => {
    if (typeof d === "object" && d !== null) {
      const q = [];
      if (d.from) q.push(`from=${d.from}`);
      if (d.to)   q.push(`to=${d.to}`);
      return req("GET", `/api/reports/z${q.length?"?"+q.join("&"):""}`);
    }
    return req("GET", `/api/reports/z${d?"?date="+d:""}`);
  },
  getCustomerLoyalty:  (id)     => req("GET",   `/api/customers/${id}/loyalty`),
  getLoyaltyConfig:    ()       => req("GET",   "/api/loyalty/config"),
  setLoyaltyConfig:    (data)   => req("PATCH", "/api/loyalty/config", data),
  getPointHistory:     (id)     => req("GET",   `/api/loyalty/history/${id}`),
  adjustPoints:        (data)   => req("POST",  "/api/loyalty/adjust", data),
  getWAConfig:         ()       => req("GET",   "/api/wa/config"),
  setWAConfig:         (data)   => req("PATCH", "/api/wa/config", data),
  testWA:              (data)   => req("POST",  "/api/wa/test", data),
  getPrinterConfig:    ()       => req("GET",   "/api/printer/config"),
  setPrinterConfig:    (data)   => req("PATCH", "/api/printer/config", data),
  testPrinter:         (data)   => req("POST",  "/api/print/test", data),
  listBackups:      ()           => req("GET",    "/api/backup"),
  triggerBackup:    ()           => req("POST",   "/api/backup"),

  // Midtrans payment gateway config
  getMidtransConfig:  ()       => req("GET",   "/api/admin/midtrans-config"),
  setMidtransConfig:  (data)   => req("PATCH", "/api/admin/midtrans-config", data),
  testMidtrans:       ()       => req("POST",  "/api/admin/midtrans-test"),

  // Audio file management (thanks.mp3 etc)
  listAudio:          ()              => req("GET",    "/api/admin/audio"),
  uploadAudio:        (name, data)    => req("POST",   `/api/admin/audio/${name}`, data),
  deleteAudio:        (name)          => req("DELETE", `/api/admin/audio/${name}`),

  // Audio settings (server-persisted: volume, toggles per profile, TTS phrase)
  getAudioConfig:     ()              => req("GET",   "/api/admin/audio-config"),
  setAudioConfig:     (patch)         => req("PATCH", "/api/admin/audio-config", patch),

  // Screensaver
  getScreensaver:           ()              => req("GET",    "/api/admin/screensaver-config"),
  setScreensaverConfig:     (patch)         => req("PATCH",  "/api/admin/screensaver-config", patch),
  uploadScreensaverImage:   (name, data)    => req("POST",   `/api/admin/screensaver-image/${name}`, data),
  deleteScreensaverImage:   (name)          => req("DELETE", `/api/admin/screensaver-image/${name}`),

  // Email / SMTP config
  getEmailConfig:    ()             => req("GET",   "/api/admin/email-config"),
  setEmailConfig:    (patch)        => req("PATCH", "/api/admin/email-config", patch),
  testEmail:         (body)         => req("POST",  "/api/admin/email-test", body),
  emailZReport:      (body)         => req("POST",  "/api/reports/z/email", body),
  getStats:       ()           => req("GET",    "/api/stats"),

  // Health
  health:         ()           => req("GET",    "/api/health"),

  // Auth — enterprise (username/password) + legacy PIN
  login:            (pin)        => req("POST",  "/api/auth/login", { pin }),
  loginPassword:    (username, password) => req("POST", "/api/auth/login-password", { username, password }),
  changePassword:   (current_password, new_password) => req("POST", "/api/auth/change-password", { current_password, new_password }),
  setUserPassword:  (id, password, force_change=true) => req("POST", `/api/auth/users/${id}/set-password`, { password, force_change }),
  loginAudit:       (limit=100)   => req("GET",   `/api/auth/audit?limit=${limit}`),
  logout:           ()           => req("POST",  "/api/auth/logout"),
  getMe:            ()           => req("GET",   "/api/auth/me"),
  getUsers:         ()           => req("GET",   "/api/auth/users"),
  createUser:       (data)       => req("POST",  "/api/auth/users", data),
  updateUser:       (id, data)   => req("PATCH", `/api/auth/users/${id}`, data),

  // Tables
  getTables:        ()           => req("GET",   "/api/tables"),
  getTable:         (id)         => req("GET",   `/api/tables/${id}`),
  updateTable:      (id, data)   => req("PATCH", `/api/tables/${id}`, data),
  createTable:      (data)       => req("POST",  "/api/tables", data),
  deleteTable:      (id)         => req("DELETE",`/api/tables/${id}`),

  // Shifts
  getShifts:        ()           => req("GET",   "/api/shifts"),
  getActiveShift:   ()           => req("GET",   "/api/shifts/active"),
  openShift:        (data)       => req("POST",  "/api/shifts/open", data),
  closeShift:       (data)       => req("POST",  "/api/shifts/close", data),

  // Stock
  updateStock:      (id, data)   => req("POST",  `/api/menu/${id}/stock`, data),
  bulkStock:        (updates)    => req("POST",  "/api/menu/stock/bulk", { updates }),

  // Notifications
  notifyReady:      (orderId)    => req("POST",  "/api/notify/ready", { orderId }),

  // Receipt
  getReceipt:       (orderId)    => req("GET",   `/api/receipt/${orderId}`),

  // Staff call
  staffCall:        (data)       => req("POST",  "/api/staff-call", data),
  getStaffCalls:    ()           => req("GET",   "/api/staff-call"),
  resolveCall:      (id)         => req("PATCH", `/api/staff-call/${id}/resolve`),

  // Promo codes
  validatePromo:    (data)       => req("POST",   "/api/promo/validate", data),
  getPromos:        ()           => req("GET",    "/api/promo"),
  createPromo:      (data)       => req("POST",   "/api/promo", data),
  updatePromo:      (id, data)   => req("PATCH",  `/api/promo/${id}`, data),
  deletePromo:      (id)         => req("DELETE", `/api/promo/${id}`),
  getPromoStats:    ()           => req("GET",    "/api/promo/stats"),

  // Customer
  lookupCustomer:   (phone)      => req("GET",    `/api/customers/lookup?phone=${encodeURIComponent(phone)}`),
  createCustomer:   (data)       => req("POST",   "/api/customers", data),
  updateCustomer:   (id, data)   => req("PATCH",  `/api/customers/${id}`, data),
  getCustomers:     (q)          => req("GET",    `/api/customers${q||""}`),
  getCustomerStats: ()           => req("GET",    "/api/customers/stats"),
  deleteCustomer:   (id)         => req("DELETE", `/api/customers/${id}`),
  sendWATracking:   (data)       => req("POST",   "/api/customers/send-wa", data),

  // Midtrans QRIS payment
  createQRIS:       (data)       => req("POST",  "/api/payment/qris", data),
  getPayStatus:     (orderId)    => req("GET",   `/api/payment/status/${orderId}`),
  checkPayment:     (orderId)    => req("GET",   `/api/payment/check/${orderId}`),
  getPayConfig:        ()           => req("GET",   "/api/payment/config"),
  getPaymentMethods:   ()           => req("GET",   "/api/payment/methods"),
  togglePaymentMethod: (updates)    => req("PATCH", "/api/payment/methods", updates),
  setMidtransConfigLegacy:(data) => req("POST",  "/api/payment/midtrans-config", data), // legacy endpoint

  // ESB POS integration
  getESBConfig:   ()           => req("GET",    "/api/esb/config"),
  setESBConfig:   (data)       => req("POST",   "/api/esb/config", data),
  testESBPush:    ()           => req("POST",   "/api/esb/test"),
  retryESB:       ()           => req("POST",   "/api/esb/retry"),
};

// ─── WEBSOCKET HOOK ───────────────────────────────────────────────────────
export function createSocket(onMessage) {
  const wsUrl = BASE.replace("http", "ws");
  let ws;
  let reconnectTimer;
  let pingInterval;
  let retries = 0;
  let intentionalClose = false;

  function connect() {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      if (retries > 0) console.log(`🔌 WebSocket reconnected (after ${retries} tries)`);
      else            console.log("🔌 WebSocket connected");
      retries = 0;
      clearTimeout(reconnectTimer);
      // App-level keep-alive — 25s ping biar nginx idle timeout (60s) gak nutup
      if (pingInterval) clearInterval(pingInterval);
      pingInterval = setInterval(() => {
        try {
          if (ws?.readyState === 1) ws.send(JSON.stringify({ event: "ping", ts: Date.now() }));
        } catch {}
      }, 25_000);
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.event === "pong") return; // ignore keepalive echo
        onMessage(msg);
      } catch {}
    };

    ws.onclose = (e) => {
      if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
      if (intentionalClose || e.code === 1000) return;
      // Exponential backoff: 1s, 2s, 4s, ..., max 30s
      const delay = Math.min(30000, 1000 * Math.pow(2, retries));
      retries++;
      // Log only first attempt + every 5th (cut console spam)
      if (retries === 1 || retries % 5 === 0) {
        console.log(`🔌 WebSocket disconnected — reconnecting (attempt ${retries})`);
      }
      reconnectTimer = setTimeout(connect, delay);
    };

    ws.onerror = () => { /* let onclose handle reconnect */ };
  }

  // Reconnect saat tab kembali visible / network online
  const onVisible = () => {
    if (intentionalClose) return;
    if (document.visibilityState === "visible" && ws?.readyState !== 1) {
      retries = 0;
      clearTimeout(reconnectTimer);
      connect();
    }
  };
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("online", onVisible);

  connect();

  return {
    send: (event, data) => ws?.readyState === 1 && ws.send(JSON.stringify({ event, data })),
    close: () => {
      intentionalClose = true;
      clearTimeout(reconnectTimer);
      if (pingInterval) clearInterval(pingInterval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
      ws?.close(1000);
    },
  };
}
