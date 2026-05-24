# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Bites & Co.** is a React + Vite self-order kiosk for a restaurant. It is a single-page app with state-based screen navigation (no router). The source code lives inside `bites-kiosk.zip` — extract it before making changes, then re-zip and commit.

The app is deployed to GitHub Pages via GitHub Actions on every push to `main`.

## Commands

All commands run from the extracted `bites-kiosk/` directory after `npm install`:

```bash
npm run dev       # Start dev server (Vite, hot reload)
npm run build     # Build to dist/ for production
npm run preview   # Preview the production build locally
npm run deploy    # Build + push to gh-pages branch via gh-pages CLI
```

There is no linter and no test suite configured.

## Architecture

The entire app lives in **`src/Kiosk.jsx`** (~610 lines). `App.jsx` is a thin re-export of `Kiosk`. There is no routing library.

### Screen state machine

The `Kiosk` component controls which screen is shown via two pieces of state:

- `orderType` — `null` (shows welcome/landing screen) | `"dine"` | `"takeaway"`
- `screen` — `"menu"` | `"cart"` | `"success"`

Progression: Welcome → Menu → Cart → Success → (reset to Welcome).

### Data model

All data is declared as module-level constants in `Kiosk.jsx`:

- **`menuData`** — `{ categories: string[], items: MenuItem[] }`. Each item has `id`, `name`, `category`, `price` (IDR integer), `desc`, `cal`, `tag`, `emoji`.
- **`addonsByCategory`** — keyed by category display name (e.g. `"🍔 Burgers"`). Each value is an array of add-on groups, each group having `type: "single" | "multi"` and `options: { id, label, price }[]`.
- **`TAX_RATE`** — `0.11` (PPN 11%)
- **`tagColors`** — maps tag strings like `"BESTSELLER"` to `{ bg, text }` color pairs.

### Cart

Cart entries are objects: `{ item, addons, note, addonTotal, qty, uid }`. The `uid` is `Date.now()` at add time, which allows the same menu item to appear as separate cart entries if added with different add-ons. Quantity changes call `changeQty(uid, delta)`; when `qty` drops to 0 the entry is filtered out.

`getAddonLabels(addons, category)` converts the stored addon selection map back to human-readable strings for cart display, skipping the default (first) option of single-select groups.

### Styling

**All styles are inline JS objects** — no CSS modules, no Tailwind, no styled-components. There are two style objects in `Kiosk.jsx`:

- `styles` (aliased as `S`) — main Kiosk component styles
- `M` — `AddonModal` component styles

`index.css` provides only a global box-sizing reset and background color.

Google Fonts (Bebas Neue + DM Sans) are loaded via `@import` inside JSX `<style>` tags at runtime. Bebas Neue is used for headings/brand text; DM Sans for body copy.

### Add-on modal

`AddonModal` is a self-contained component that manages its own selection state. It initializes single-select groups to their first option and multi-select groups to empty arrays. `onConfirm` receives `(item, addons, note, addonTotal)` and is handled by `handleConfirmAddon` in the parent, which appends the new cart entry.

## Deployment

`vite.config.js` sets `base: '/bites-kiosk/'` to match the GitHub Pages repo path. Change this if the repo is renamed. CI/CD is handled by `.github/workflows/deploy.yml`, which runs `npm install && npm run build` and uploads `dist/` to GitHub Pages on every push to `main`.
