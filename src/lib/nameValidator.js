// src/lib/nameValidator.js
// Shared customer name validator — dipake di CustomerNameInput, MemberList edit,
// AdminCustomerImport, dan sales-pitch friendly error messages.

// Returns { valid: bool, error: string|null, cleaned: string }
export function validateCustomerName(raw) {
  const cleaned = String(raw || "").trim();
  if (!cleaned) return { valid: false, error: "Nama wajib diisi", cleaned: "" };
  if (cleaned.length < 2) return { valid: false, error: "Nama minimal 2 huruf", cleaned };
  if (cleaned.length > 60) return { valid: false, error: "Nama maksimal 60 karakter", cleaned: cleaned.slice(0, 60) };
  // No digit allowed anywhere
  if (/\d/.test(cleaned)) return { valid: false, error: "Nama tidak boleh mengandung angka", cleaned };
  // No special symbols (allow letters, space, dot, apostrophe, dash for compound names)
  if (!/^[a-zA-Z\s.\-']+$/.test(cleaned)) return { valid: false, error: "Nama hanya boleh huruf, spasi, titik, atau apostrof", cleaned };
  // Suspicious patterns: single repeated char ("xxx", "aaa")
  if (/^(.)\1+$/.test(cleaned.replace(/\s/g, ""))) return { valid: false, error: "Nama tidak valid (karakter berulang)", cleaned };
  return { valid: true, error: null, cleaned };
}
