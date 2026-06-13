# Plan 10: NW Snapshots + Asset Allocation + DrillModal + FIRE Savings Design

## Goal

Wire the last four mock data areas: net-worth trend charts, asset allocation donut, cashflow drill-down transactions, and FIRE scenario savings rate.

## Architecture

Four independent wiring tasks, no new screens, no breaking API changes.

### A. Asset allocation donut (Accounts screen)
`liveAssets` already fetched in accounts.jsx (Plan 9). Compute `liveAllocation` inline: group assets by normalized type, sum `current_value × ownership_pct/100`. Replace `DATA.ALLOCATION` in donut and legend. Mock fallback when assets array is empty.

Type normalization: etf/stock/bond → 'stocks', real_estate → 'realestate', crypto → 'crypto', gold → 'gold', everything else → 'bank'.

Group display config (label + color) is constant — pulled from `DATA.ALLOCATION` key-based lookup so colors stay consistent with mock.

### B. Cashflow DrillModal
Backend `/transactions` already supports `?category=X`. Update `api.ts` `getTransactions` to accept optional `category?: string` and `limit?: number`. DrillModal fetches on open (when `drill` state changes from null), stores results in local state, falls back to empty list on error. Loading state shown while fetching.

### C. FIRE scenario live savings
Add `base_monthly_savings` to `/analytics/summary` response: `round((income - expenses) / 12, 2)` using the same trailing-12-month totals already computed in the endpoint. Add field to `AnalyticsSummary` TypeScript interface. Dashboard stores it in state (initial value = `S.base_monthly_savings` mock), overwrites from analytics on load. FIRE `useMemo` consumes it instead of `S.base_monthly_savings`.

### D. NW snapshot history
- New `NWSnapshot` SQLAlchemy model: `id, date (Date, unique), net_worth (Float)`
- Alembic migration adds `nw_snapshots` table
- `POST /nw-snapshots` — computes net worth from current assets, upserts by today's date
- `GET /nw-snapshots?limit=24` — returns list `[{id, date, net_worth}]` sorted by date ascending
- `api.ts`: `NWSnapshotRead`, `captureNWSnapshot()`, `getNWSnapshots(limit)`
- Dashboard: calls `captureNWSnapshot()` fire-and-forget on mount, then `getNWSnapshots(24)` → wires to hero AreaChart. Falls back to `DATA.NW_SERIES` when fewer than 2 snapshots.
- Accounts screen: calls `getNWSnapshots(24)` on mount; 12M/24M toggle maps to `slice(-12)` vs full array. Falls back to `DATA.NW_SERIES`.

## Testing

- `test_summary` updated to include `base_monthly_savings`
- `test_summary_empty_db` updated to include `base_monthly_savings: 0.0`
- `test_nw_snapshot_capture` — POST creates snapshot, re-POST same day updates it
- `test_nw_snapshot_list` — GET returns snapshots sorted by date

## Out of scope

- User-triggered "Record snapshot" button (auto-capture on load is sufficient)
- Snapshot history before the first app load (no backfill)
- DrillModal pagination (limit 12 is enough for the modal)
