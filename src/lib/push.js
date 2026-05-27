// src/lib/push.js — Web Push subscribe helper.
//
// Usage:
//   import { subscribeToOrderPush } from './lib/push.js';
//   await subscribeToOrderPush({ orderId, phone });
//
// Flow:
//   1. Check support (Notification API + SW + PushManager)
//   2. Request permission if not granted
//   3. Get SW registration → subscribe to push with VAPID public key
//   4. POST subscription to /api/push/subscribe with order/phone context
//
// Idempotent — re-running just updates the row on the server.

import API_HOST from "../apiBase.js";

function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - base64.length % 4) % 4);
  const cleaned = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(cleaned);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function isPushSupported() {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window;
}

export async function getPushPermission() {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

let _cachedKey = null;
async function _getVapidKey() {
  if (_cachedKey) return _cachedKey;
  const r = await fetch(`${API_HOST}/api/push/vapid-public-key`);
  const j = await r.json();
  _cachedKey = j.publicKey;
  return _cachedKey;
}

// Returns: 'subscribed' | 'denied' | 'unsupported' | 'error'
export async function subscribeToOrderPush({ orderId, phone } = {}) {
  if (!isPushSupported()) return "unsupported";

  // Request permission if not yet granted
  if (Notification.permission === "default") {
    const p = await Notification.requestPermission();
    if (p !== "granted") return p === "denied" ? "denied" : "error";
  } else if (Notification.permission === "denied") {
    return "denied";
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    let sub = existing;
    if (!sub) {
      const vapid = await _getVapidKey();
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid),
      });
    }
    const payload = {
      subscription: sub.toJSON(),
      ref_order_id: orderId ? String(orderId) : undefined,
      ref_phone: phone ? String(phone).replace(/[^0-9]/g, "") : undefined,
    };
    await fetch(`${API_HOST}/api/push/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return "subscribed";
  } catch (e) {
    console.warn("[push] subscribe failed:", e.message);
    return "error";
  }
}

export async function unsubscribePush() {
  if (!isPushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    await fetch(`${API_HOST}/api/push/unsubscribe`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    await sub.unsubscribe();
  } catch {}
}
