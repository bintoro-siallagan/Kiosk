#!/usr/bin/env bash
# ============================================================================
# bundle-pos-files.sh
# 
# Bundle file-file POS bites-kiosk ke 1 file teks buat diupload ke Claude.
# Output: pos-bundle-YYYY-MM-DD.txt di direktori sekarang.
#
# Usage:
#   cd ~/path/to/bites-kiosk
#   chmod +x bundle-pos-files.sh
#   ./bundle-pos-files.sh
#
# Edit array FILES di bawah kalau mau tambah/kurang file.
# ============================================================================

set -e

# ---------- Konfigurasi ----------
FILES=(
  # Spine + routing
  "src/POSApp.jsx"

  # Login & Home
  "src/POSLogin.jsx"
  "src/POSHome.jsx"

  # Order flow yang mau di-refactor jadi chip
  "src/OrderTypePicker.jsx"
  "src/POSCustomerPicker.jsx"
  "src/CustomerInput.jsx"
  "src/CustomerNameInput.jsx"

  # Menu & order
  "src/POSMenu.jsx"
  "src/POSOrder.jsx"

  # Payment — target refactor besar
  "src/POSConfirm.jsx"
  "src/CashPayment.jsx"
  "src/POSSplitPayment.jsx"
  "src/POSSuccess.jsx"

  # Layar tamu — target sync realtime
  "src/POSCDS.jsx"
  "src/CustomerTrackingPage.jsx"

  # State management
  "src/MenuContext.jsx"

  # Config (kecil, tapi penting buat tau setup)
  "package.json"
  "vite.config.js"
  "vite.config.ts"
)

# ---------- Init ----------
TS=$(date '+%Y-%m-%d')
TS_FULL=$(date '+%Y-%m-%d %H:%M:%S')
OUTPUT="pos-bundle-${TS}.txt"
PROJECT=$(basename "$(pwd)")

# Color codes (works di macOS Terminal + iTerm)
GREEN='\033[32m'
RED='\033[31m'
YELLOW='\033[33m'
DIM='\033[2m'
RESET='\033[0m'

echo ""
echo "${DIM}Bundling POS files...${RESET}"
echo "Project: ${GREEN}$PROJECT${RESET}"
echo "Output:  ${GREEN}$OUTPUT${RESET}"
echo ""

# ---------- Header ----------
{
  echo "================================================================"
  echo "# Bites-Kiosk POS Bundle"
  echo "# Project:     $PROJECT"
  echo "# Generated:   $TS_FULL"
  echo "# Working dir: $(pwd)"
  echo "================================================================"
} > "$OUTPUT"

# ---------- Project structure snapshot ----------
{
  echo ""
  echo "// ----------------------------------------------------------------"
  echo "// PROJECT STRUCTURE (src/, depth 2)"
  echo "// ----------------------------------------------------------------"
  if command -v tree > /dev/null 2>&1; then
    tree -L 2 -I 'node_modules|.font-backup-*|.git' src/ 2>/dev/null || true
  else
    find src/ -maxdepth 2 -type f \
      \( -name "*.jsx" -o -name "*.tsx" -o -name "*.js" -o -name "*.ts" -o -name "*.css" \) \
      | grep -v '\.font-backup-' \
      | sort
  fi
  echo ""
} >> "$OUTPUT"

# ---------- Concat files ----------
FOUND=0; MISSING=0; TOTAL_LINES=0

for f in "${FILES[@]}"; do
  if [ -f "$f" ]; then
    LINES=$(wc -l < "$f" | tr -d ' ')
    TOTAL_LINES=$((TOTAL_LINES + LINES))
    {
      echo ""
      echo "// ============================================================"
      echo "// FILE: $f"
      echo "// LINES: $LINES"
      echo "// ============================================================"
      cat "$f"
      echo ""
    } >> "$OUTPUT"
    printf "  ${GREEN}✓${RESET} %-40s %5d lines\n" "$f" "$LINES"
    FOUND=$((FOUND + 1))
  else
    {
      echo ""
      echo "// >>> NOT FOUND: $f"
    } >> "$OUTPUT"
    printf "  ${RED}✗${RESET} %-40s ${DIM}(skip)${RESET}\n" "$f"
    MISSING=$((MISSING + 1))
  fi
done

# ---------- Summary ----------
SIZE=$(du -h "$OUTPUT" | cut -f1)
SIZE_KB=$(du -k "$OUTPUT" | cut -f1)

echo ""
echo "================================================================"
printf "  Files included: ${GREEN}%d${RESET}\n" "$FOUND"
printf "  Files missing:  ${YELLOW}%d${RESET}\n" "$MISSING"
printf "  Total lines:    %d\n" "$TOTAL_LINES"
printf "  Bundle size:    ${GREEN}%s${RESET}\n" "$SIZE"
echo "================================================================"
echo ""

# ---------- Sanity check ----------
if [ "$SIZE_KB" -gt 2000 ]; then
  echo "${YELLOW}⚠  Bundle > 2MB. Mungkin ada file kebesaran yang masuk.${RESET}"
  echo "   Cek isinya dulu sebelum upload."
  echo ""
fi

echo "${DIM}Selanjutnya:${RESET}"
echo "  1. Buka chat Claude"
echo "  2. Drag-drop ${GREEN}$OUTPUT${RESET} ke chat"
echo "  3. Kirim pesan apapun (atau langsung: 'lanjut audit pos bites-kiosk')"
echo ""

# ---------- Optional: add to .gitignore ----------
if [ -f ".gitignore" ] && ! grep -q "pos-bundle-" .gitignore; then
  echo "${DIM}Tip: tambahin 'pos-bundle-*.txt' ke .gitignore biar gak ke-commit:${RESET}"
  echo "  echo 'pos-bundle-*.txt' >> .gitignore"
  echo ""
fi
