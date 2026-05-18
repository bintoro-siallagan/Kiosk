#!/usr/bin/env node
// ── AUTO WEBHOOK SIMULATOR ──────────────────────────────────────────────────
// Jalankan: node auto-webhook.js
// Script ini monitor backend dan otomatis simulate payment sukses
// untuk testing tanpa perlu manual trigger webhook

const http = require("http");

let lastOrderId = null;
let checking = false;

console.log("🤖 Auto-Webhook Simulator aktif");
console.log("📡 Monitoring http://localhost:3001/api/orders");
console.log("✅ Setiap order baru akan otomatis di-settle dalam 3 detik\n");

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(null); }
      });
    }).on("error", reject);
  });
}

function httpPost(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) },
    };
    const req = http.request(url, options, (res) => {
      let d = "";
      res.on("data", (chunk) => (d += chunk));
      res.on("end", () => resolve(d));
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function checkOrders() {
  if (checking) return;
  checking = true;
  try {
    const data = await httpGet("http://localhost:3001/api/orders");
    const orders = Array.isArray(data) ? data : (data?.orders || []);
    
    // Find latest unpaid order
    const unpaid = orders
      .filter(o => !o.paymentStatus || o.paymentStatus !== "paid")
      .filter(o => o.pay === "QRIS" || o.pay === "gopay")
      .sort((a, b) => b.time - a.time);
    
    if (unpaid.length === 0) { checking = false; return; }
    
    const latest = unpaid[0];
    if (latest.id === lastOrderId) { checking = false; return; }
    
    lastOrderId = latest.id;
    console.log(`\n🆕 Order baru terdeteksi: #${latest.id} — Rp ${latest.total?.toLocaleString()}`);
    console.log(`⏳ Menunggu 3 detik sebelum simulate payment...`);
    
    await new Promise(r => setTimeout(r, 3000));
    
    // Find midtrans order ID for this internal order
    const checkRes = await httpGet(`http://localhost:3001/api/payment/check/${latest.id}`);
    
    if (checkRes?.paid) {
      console.log(`✅ Order #${latest.id} sudah paid — skip`);
      checking = false;
      return;
    }
    
    const midtransOrderId = checkRes?.midtransOrderId;
    if (!midtransOrderId) {
      console.log(`⚠️  Tidak ada midtrans order ID untuk #${latest.id}`);
      checking = false;
      return;
    }
    
    console.log(`💳 Simulate payment: ${midtransOrderId}`);
    
    const result = await httpPost("http://localhost:3001/api/payment/webhook", {
      order_id: midtransOrderId,
      transaction_status: "settlement",
      payment_type: "gopay",
      gross_amount: String(latest.total),
    });
    
    console.log(`🎉 Webhook sent! Response: ${result}`);
    console.log(`✅ Order #${latest.id} seharusnya sudah PAID di kiosk!\n`);
    
  } catch (e) {
    // Backend tidak jalan
  }
  checking = false;
}

// Check every 2 seconds
setInterval(checkOrders, 2000);
checkOrders();
