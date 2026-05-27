// ─── ESB ORDER QS — MENU INTEGRATION ─────────────────────────────────────
// Dokumentasi: https://developers.esb.co.id/eso-qs/
// Isi ESB_CONFIG sesuai kredensial dari dashboard ESB Anda

export const ESB_CONFIG = {
  baseUrl:   import.meta.env.VITE_ESB_BASE_URL  || "https://api.esb.co.id/eso-qs/v1",
  apiKey:    import.meta.env.VITE_ESB_API_KEY   || "",   // dari ESB Dashboard
  outletId:  import.meta.env.VITE_ESB_OUTLET_ID || "",   // Outlet ID restoran Anda
  clientId:  import.meta.env.VITE_ESB_CLIENT_ID || "",   // Client ID (jika ada)
};

// ─── HTTP HELPER ──────────────────────────────────────────────────────────
async function esbRequest(method, path, body) {
  if (!ESB_CONFIG.apiKey) throw new Error("ESB API Key belum diisi");
  if (!ESB_CONFIG.outletId) throw new Error("ESB Outlet ID belum diisi");

  const url = `${ESB_CONFIG.baseUrl}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type":  "application/json",
      "Accept":        "application/json",
      "Authorization": `Bearer ${ESB_CONFIG.apiKey}`,
      "X-Outlet-Id":   ESB_CONFIG.outletId,
      ...(ESB_CONFIG.clientId ? { "X-Client-Id": ESB_CONFIG.clientId } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({ message: res.statusText }));
  if (!res.ok) throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
  return data;
}

// ─── MAPPER: KaryaOS Menu → ESB Format ───────────────────────────────────
function mapMenuToESB(item) {
  // image_url is the canonical field (uploaded via /api/master/menus/:id/image).
  // Fall back to legacy `image` for older items.
  let imageUrl = item.image_url || item.image || "";
  // If relative path (e.g. /uploads/xyz.jpg), expand to absolute so ESB can fetch
  if (imageUrl && imageUrl.startsWith("/")) {
    imageUrl = (typeof window !== "undefined" ? window.location.origin : "") + imageUrl;
  }
  return {
    item_code:    String(item.id),
    item_name:    item.name,
    category:     item.cat || item.category || "Uncategorized",
    price:        item.price,
    is_available: item.avail !== false,
    description:  item.desc || item.description || "",
    image_url:    imageUrl,
    emoji:        item.emoji || item.e || "",
    tags:         item.tag ? [item.tag] : (Array.isArray(item.tags) ? item.tags : []),
    free_extras:  item.freeToppings || item.free_extras || 0,
    modifier_groups: Array.isArray(item.modifier_groups) ? item.modifier_groups : [],
  };
}

// ─── ESB API FUNCTIONS ───────────────────────────────────────────────────

/**
 * GET semua menu dari ESB (dengan fallback endpoint)
 */
export async function esbGetMenu() {
  // Coba beberapa endpoint yang umum dipakai ESB Order QS
  const endpoints = [
    `/outlets/${ESB_CONFIG.outletId}/menus`,
    `/outlet/${ESB_CONFIG.outletId}/menu`,
    `/menus?outlet_id=${ESB_CONFIG.outletId}`,
    `/menu/items?outlet=${ESB_CONFIG.outletId}`,
  ];
  for (const ep of endpoints) {
    try {
      const res = await esbRequest("GET", ep);
      return res;
    } catch (e) {
      if (!e.message.includes("404")) throw e;
    }
  }
  throw new Error("Endpoint menu ESB tidak ditemukan");
}

/**
 * GET kategori menu dari ESB
 */
export async function esbGetCategories() {
  const endpoints = [
    `/outlets/${ESB_CONFIG.outletId}/categories`,
    `/outlet/${ESB_CONFIG.outletId}/categories`,
    `/categories?outlet_id=${ESB_CONFIG.outletId}`,
  ];
  for (const ep of endpoints) {
    try { return await esbRequest("GET", ep); } catch (e) {
      if (!e.message.includes("404")) throw e;
    }
  }
  throw new Error("Endpoint kategori ESB tidak ditemukan");
}

/**
 * GET detail satu item menu dari ESB
 */
export async function esbGetMenuItem(itemCode) {
  return esbRequest("GET", `/outlets/${ESB_CONFIG.outletId}/menus/${itemCode}`);
}

/**
 * Mapper: ESB menu response → format KaryaOS Kiosk.
 *
 * Catatan field:
 *   - image_url: kanonik (uploaded photos). `image` di-keep alias buat backward compat.
 *   - emoji: ESB boleh isi, kalau gak ada fallback ke 🍽️ (UI nanti bisa override).
 *   - desc/description: KaryaOS pakai keduanya tergantung surface, isi dua-duanya.
 */
export function mapESBToLocal(esbItem) {
  const imageUrl = esbItem.image_url || esbItem.image || esbItem.photo_url || "";
  const desc     = esbItem.description || esbItem.desc || "";
  const tags     = Array.isArray(esbItem.tags) ? esbItem.tags
                  : (esbItem.tag ? [esbItem.tag] : []);
  return {
    id:          esbItem.item_code || esbItem.id || esbItem.menu_id || String(Math.random()),
    name:        esbItem.item_name || esbItem.name || esbItem.menu_name || "Unnamed",
    cat:         esbItem.category  || esbItem.category_name || esbItem.group || "Lainnya",
    category:    esbItem.category  || esbItem.category_name || esbItem.group || "Lainnya",
    price:       parseInt(esbItem.price || esbItem.harga || 0),
    avail:       esbItem.is_available !== false && esbItem.available !== false && esbItem.status !== "unavailable",
    desc,
    description: desc,
    tag:         tags[0] || null,
    tags,
    emoji:       esbItem.emoji || esbItem.icon || "🍽️",
    e:           esbItem.emoji || esbItem.icon || "🍽️",   // legacy alias
    image_url:   imageUrl,                                 // canonical
    image:       imageUrl,                                 // legacy alias
    freeToppings: esbItem.free_extras || esbItem.free_toppings || 0,
    _esb:        esbItem,                                  // simpan raw ESB data
  };
}

/**
 * GET + parse semua menu dari ESB, return array format KaryaOS
 */
export async function esbFetchAndMapMenu() {
  const raw = await esbGetMenu();
  // Handle berbagai format response ESB
  let items = [];
  if (Array.isArray(raw))                items = raw;
  else if (Array.isArray(raw?.data))     items = raw.data;
  else if (Array.isArray(raw?.items))    items = raw.items;
  else if (Array.isArray(raw?.menus))    items = raw.menus;
  else if (Array.isArray(raw?.menu))     items = raw.menu;
  else if (Array.isArray(raw?.results))  items = raw.results;
  else throw new Error("Format response ESB tidak dikenali: " + JSON.stringify(raw).slice(0, 100));
  return items.map(mapESBToLocal);
}

/**
 * PUSH satu item menu ke ESB (create or update)
 */
export async function esbPushMenuItem(item) {
  const payload = mapMenuToESB(item);
  // Coba update dulu, kalau 404 maka create baru
  try {
    return await esbRequest("PUT", `/outlets/${ESB_CONFIG.outletId}/menus/${payload.item_code}`, payload);
  } catch (e) {
    if (e.message.includes("404") || e.message.includes("not found")) {
      return esbRequest("POST", `/outlets/${ESB_CONFIG.outletId}/menus`, payload);
    }
    throw e;
  }
}

/**
 * PUSH semua menu sekaligus (bulk)
 */
export async function esbPushAllMenu(menuItems) {
  const payload = {
    outlet_id: ESB_CONFIG.outletId,
    items: menuItems.map(mapMenuToESB),
  };
  return esbRequest("POST", `/outlets/${ESB_CONFIG.outletId}/menus/bulk`, payload);
}

/**
 * Update ketersediaan item (available/unavailable)
 */
export async function esbUpdateAvailability(itemCode, isAvailable) {
  return esbRequest("PATCH", `/outlets/${ESB_CONFIG.outletId}/menus/${itemCode}/availability`, {
    is_available: isAvailable,
  });
}

/**
 * Update harga item
 */
export async function esbUpdatePrice(itemCode, price) {
  return esbRequest("PATCH", `/outlets/${ESB_CONFIG.outletId}/menus/${itemCode}/price`, {
    price,
  });
}

/**
 * DELETE item dari ESB
 */
export async function esbDeleteMenuItem(itemCode) {
  return esbRequest("DELETE", `/outlets/${ESB_CONFIG.outletId}/menus/${itemCode}`);
}

/**
 * Test koneksi ke ESB
 */
export async function esbTestConnection() {
  return esbRequest("GET", `/outlets/${ESB_CONFIG.outletId}/info`);
}
