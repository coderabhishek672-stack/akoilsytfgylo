# AGENTS.md

## Project
AURUM — XAU/USDT multi-timeframe scalping terminal. Next.js 16 (App Router, Turbopack), React 19,
Tailwind 4, SWR, lightweight-charts. Read-only market terminal: no API keys, no order placement.

## Commands
- `npm run build` — production build (runs the TypeScript check; the real gate)
- `npm run start` — serve; use `PORT=12000 npm run start`
- `npx tsc --noEmit` — typecheck alone
- `npx eslint .` — hangs in this environment; do not rely on it

## Architecture
- `lib/exchange.ts` — venue layer. Binance futures REST walks a mirror list; on HTTP 451 it falls
  back to OKX. OKX interval mapping matters: uppercase `1H/2H/4H`, and `3h` is resampled from `1h`.
  `probeBinanceSocket()` opens a real WebSocket because Binance serves the socket from a different
  edge than REST — the socket is reachable here even though every REST host returns 451.
- `lib/indicators.ts` — pure indicator math (EMA, MACD, Supertrend, ADX/DI, RSI, VWAP, Bollinger,
  Stochastic, structure, ATR, relative volume).
- `lib/signal-engine.ts` — the core. `buildTimeline` → `createConfluenceLookup` → `replay` /
  `analyzeTimeframe` / `evaluateLock` / `buildConfluences`.
- `hooks/use-market.ts` — Binance WebSocket for quotes/depth/tape, REST recovery, and folds the live
  quote into the forming candle. Note: the SWR candles request is named `candlesRequest` to avoid
  colliding with the derived `candles` array.
- `hooks/use-signals.ts` — polls `/api/market/signals`, re-evaluates lock *stage* against live price.
- `app/api/market/{route,candles,instrument,signals,sources}/route.ts` — all `force-dynamic`.

## Invariants worth preserving
- **Historical confluence must be time-aligned.** A lock taken at a past close is judged against what
  the other timeframes looked like at that same moment via `ConfluenceLookup`. Never fall back to the
  current snapshot; that was a real bug.
- **A committed lock is frozen.** `lock.levels`, `lock.gates` and `lock.reasons` are captured at lock
  time. The indicator panel shows live values, so a locked timeframe legitimately displays lock-time
  gates/reasons next to live indicators. Do not "fix" that mismatch — label it instead.
- **Preview levels only exist once a direction is armed** (|score| ≥ 50). Below that `previewLevels`
  is `null` and the panel renders dashes. Preview lines are dashed and dimmed on the chart.
- **Derived values must not be frozen:** "Market entry now" uses the live price, not a stored value.
  Frozen text that quotes a distance must say "at lock time".

## Honesty constraints (do not regress)
The user originally asked for "100% accurate" signals. The terminal deliberately refuses to claim
that. Keep: confidence is weighted agreement, not a probability; no win rate; the methodology dialog
states a high-confidence lock can still lose; the signal-activity table is labelled as a deterministic
replay of real closed candles, not executed trades; "touching a level does not prove an order filled".

## Environment notes
- Binance REST is geo-blocked here (all hosts return 451); the Binance futures WebSocket works.
- `GITHUB_TOKEN` is not populated, so `git push` prompts for a username and cannot complete.
  Commit locally on a branch; ask the user to push or supply a token.
