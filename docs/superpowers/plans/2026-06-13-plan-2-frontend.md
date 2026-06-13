# Financial Independence Tracker — Plan 2: Frontend Port

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the high-fidelity prototype in `handoff/app/` into the Vite + React + TypeScript app at `frontend/`, producing a working 5-screen FIRE tracker, with the settings and transactions screens wired to the FastAPI backend where endpoints exist.

**Architecture:** The prototype is a globals-based React app (no modules; `React`, `DATA`, and all components are window globals). The port converts each file to an ES module under `frontend/src/`, keeps the prototype's own CSS (`app.css`) and hand-rolled SVG charts instead of introducing Tailwind/Recharts (visually identical, far less risk), keeps the prototype's state-based navigation (no router), and drops the design-time `tweaks-panel.jsx`. Mock data from `data.js` remains the data layer for aggregates the backend doesn't compute yet; a thin `lib/api.ts` wires live endpoints (`/settings`, `/transactions` PATCH) with graceful fallback when the backend is offline.

**Deviation note (autonomous decision):** The handoff README suggests Tailwind + Recharts + React Router. The prototype itself uses plain CSS variables, custom SVG charts, and state navigation — porting those directly is faithful to the visual spec, avoids three new dependencies, and keeps the diff reviewable. Aggregation endpoints (`/fire/summary`, `/cashflow/*`, `/networth/history`) are backend work deferred to Plan 3.

**Tech Stack:** React 19, Vite 8, TypeScript 6 (`allowJs` for ported `.jsx`), prototype CSS.

**Status: COMPLETE (2026-06-13).** All tasks executed. Verified: `npm run build` green, backend `pytest` 33/33 green, all 5 screens render in the Vite dev server with zero console errors, and `/settings` GET/PATCH round-trips from the frontend origin against the running backend. Bugs found in the prototype and fixed during the port: `FMT.compactUSD` didn't exist (CashBars tooltip), `Money` hardcoded USD as base, ImportTab defaulted to a nonexistent `vcb` account id.

---

## File Map

```
frontend/
  index.html                 ← title, Google Fonts (Manrope, JetBrains Mono)
  tsconfig.app.json          ← allowJs: true
  src/
    main.tsx                 ← entry, imports styles/app.css
    App.tsx                  ← app shell ported from handoff/app/app.jsx (minus tweaks panel)
    styles/app.css           ← ported handoff/app/app.css verbatim
    data.js                  ← ported handoff/app/data.js as ES module
    ui.jsx                   ← ported handoff/app/ui.jsx as ES module
    lib/api.ts               ← fetch wrapper for http://localhost:8000
    screens/
      dashboard.jsx          ← ported screen-dashboard.jsx
      cashflow.jsx           ← ported screen-cashflow.jsx
      accounts.jsx           ← ported screen-accounts.jsx
      transactions.jsx       ← ported screen-transactions.jsx
      settings.jsx           ← ported screen-settings.jsx
```

**Porting transform applied to every `.jsx` file (same recipe each time):**
1. Add ES imports: `import React, { useState, useEffect, ... } from 'react'` replacing destructuring from the `React` global (the prototype aliases e.g. `const { useState: uS } = React`).
2. Add `import { DATA, fmt, ... } from '../data.js'` / `import { Card, Tag, ... } from '../ui.jsx'` for every global the file references.
3. Add `export` to every top-level component/constant other files reference.
4. Remove the `ReactDOM.createRoot(...)` call (lives in `main.tsx`) and all `TweaksPanel` usage.

## Verification per task

No vitest infra yet; each task is verified by `npm run build` (runs `tsc -b && vite build` — type/syntax gate) and, for the final task, loading the app in the Vite preview against the running backend.

---

## Task 1: Clean scaffold, fonts, CSS, data module

**Files:**
- Modify: `frontend/index.html`, `frontend/tsconfig.app.json`
- Create: `frontend/src/styles/app.css` (from `handoff/app/app.css`)
- Create: `frontend/src/data.js` (from `handoff/app/data.js`)
- Delete: scaffold cruft (`App.css`, `App.tsx` contents replaced later, `assets/hero.png`, `assets/react.svg`, `assets/vite.svg`, `public/icons.svg`)

- [ ] **Step 1:** Set `"allowJs": true` in `tsconfig.app.json` compilerOptions.
- [ ] **Step 2:** Replace `index.html` head: title `FIRE Tracker`, add Google Fonts link for Manrope (400–800) + JetBrains Mono (400–600), keep `#root` + `main.tsx` script.
- [ ] **Step 3:** Copy `handoff/app/app.css` → `frontend/src/styles/app.css` unchanged.
- [ ] **Step 4:** Copy `handoff/app/data.js` → `frontend/src/data.js`; convert to ES module (`export` the globals it defines — inspect file for its top-level bindings, e.g. `DATA`, `fmt`, FX helpers — and export each).
- [ ] **Step 5:** Temporarily stub `src/App.tsx` to `export default function App(){return <div/>}` and `src/main.tsx` to render it importing `./styles/app.css`; delete unused scaffold assets and `App.css`.
- [ ] **Step 6:** Run `npm run build` in `frontend/`. Expected: success.
- [ ] **Step 7:** Commit: `feat: port prototype CSS and data layer into frontend`

## Task 2: Shared UI primitives

**Files:**
- Create: `frontend/src/ui.jsx` (from `handoff/app/ui.jsx`)

- [ ] **Step 1:** Copy `handoff/app/ui.jsx` → `frontend/src/ui.jsx`; apply the porting transform (imports from `react` and `./data.js`, export all components: nav, cards, charts, dropdowns, etc.). Drop anything only used by the tweaks panel.
- [ ] **Step 2:** `npm run build`. Expected: success (App still stub; ui.jsx must compile).
- [ ] **Step 3:** Commit: `feat: port shared UI primitives`

## Task 3–7: Screens (one task + commit per screen)

For each of `dashboard`, `cashflow`, `accounts`, `transactions`, `settings`:

**Files:** Create `frontend/src/screens/<name>.jsx` from `handoff/app/screen-<name>.jsx`.

- [ ] **Step 1:** Copy and apply the porting transform (imports from `react`, `../data.js`, `../ui.jsx`; export the screen component).
- [ ] **Step 2:** `npm run build`. Expected: success.
- [ ] **Step 3:** Commit: `feat: port <name> screen` (5 separate commits).

## Task 8: App shell and entry

**Files:**
- Modify: `frontend/src/App.tsx`, `frontend/src/main.tsx`

- [ ] **Step 1:** Rewrite `App.tsx` from `handoff/app/app.jsx`: keep `ls`/`lset` localStorage helpers, screen/params/household/currency/reviewCount state, `go()` navigation, `TopNav` + `.scroll` body switch. Drop `useTweaks`, `TweaksPanel`, FONTS/ACCENTS, and the CSS-variable effect (defaults live in app.css).
- [ ] **Step 2:** `main.tsx`: createRoot rendering `<App />`, importing `./styles/app.css`.
- [ ] **Step 3:** `npm run build`. Expected: success.
- [ ] **Step 4:** Run `npm run dev`, open http://localhost:5173, click through all 5 screens.
- [ ] **Step 5:** Commit: `feat: add app shell — all five screens navigable`

## Task 9: API client + live wiring where endpoints exist

**Files:**
- Create: `frontend/src/lib/api.ts`
- Modify: `frontend/src/screens/transactions.jsx`, `frontend/src/screens/settings.jsx`

- [ ] **Step 1:** Create `lib/api.ts`:

```ts
const BASE = 'http://localhost:8000';

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.status === 204 ? (undefined as T) : res.json();
}

export const getSettings = () => api<{ base_currency: string }>('/settings');
export const updateSettings = (base_currency: string) =>
  api('/settings', { method: 'PATCH', body: JSON.stringify({ base_currency }) });
export const patchTransaction = (id: number, body: object) =>
  api(`/transactions/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
```

- [ ] **Step 2:** In `settings.jsx`, on mount try `getSettings()` to initialize base currency and call `updateSettings()` on change; wrap in try/catch so mock-mode still works offline.
- [ ] **Step 3:** In `transactions.jsx`, fire `patchTransaction(id, {category, needs_review:false})` (fire-and-forget with catch) when a category is assigned inline.
- [ ] **Step 4:** `npm run build`. Expected: success.
- [ ] **Step 5:** Commit: `feat: add API client and wire settings + transaction category updates`

## Task 10: Final verification

- [ ] **Step 1:** `npm run build` — success.
- [ ] **Step 2:** `cd backend && pytest tests/ -q` — all green (unchanged).
- [ ] **Step 3:** `npm run dev` + backend `uvicorn app.main:app`; click through every screen; verify no console errors.
- [ ] **Step 4:** Commit: `feat: complete Plan 2 — frontend port of FIRE tracker prototype`
