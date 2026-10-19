# AURUM — XAU/USDT Multi-Timeframe Scalping Terminal

A real-time gold (XAU/USDT) scalping terminal for the Binance USDⓈ-M perpetual, with a
seven-timeframe signal engine and a "Signal Lock" system that freezes a trade plan once it is
committed.

Read-only market analysis. The terminal holds no API keys, places no orders, and stores nothing
about you.

## What it does

- **Seven timeframes** — 1m, 3m, 5m, 15m, 30m, 1h, 3h. Switch at the top of the terminal. Each
  timeframe keeps its **own independent lock**.
- **Signal Lock** — a state machine: `SEARCHING → ARMING → LOCKED → TRIGGERED → TARGET HIT /
  INVALIDATED / EXPIRED`. Once locked, direction, entry, stop and targets are **frozen**. Live
  price can advance a lock or invalidate it, but never move its levels.
- **Six lock gates** must pass before anything is committed:

  | Gate | Threshold |
  |------|-----------|
  | Timeframe score | \|score\| ≥ 60 |
  | Multi-timeframe agreement | ≥ 62% weighted |
  | Trend strength | ADX ≥ 18 |
  | Market structure | not opposing |
  | Volume participation | ≥ 0.75× the 20-bar average |
  | Breadth | ≥ 3 of 7 timeframes aligned |

- **Preview levels** — while a direction is arming but the gates haven't cleared, the panel shows
  dashed, clearly-labelled preview levels. These can still shift. Nothing is committed until the
  state reads `LOCKED`.
- **Trade plan** — ideal entry, entry zone, stop loss, three targets at 1R/2R/3R, distance to entry
  in ATR, progress to entry, and a countdown to expiry.
- **Indicator engine** — 10–11 weighted factors: EMA stack (9/21/50/200), MACD, Supertrend, ADX/DI,
  RSI, VWAP, Bollinger position, market structure, Stochastic, relative volume.
- **Order book depth, time & sales tape, derivatives panel, risk calculator, methodology dialog.**

## Data sources

All data is real. There is no simulated or seeded market data.

- **Binance USDⓈ-M XAUUSDT perpetual WebSocket** — quotes, order book depth and the trade tape
  (`bookTicker`, `depth20`, `aggTrade`), with REST recovery.
- **Binance REST** for candle history, walking a list of mirror hosts.
- **OKX XAU-USDT-SWAP fallback** — Binance's REST API returns HTTP 451 from some regions (including
  many cloud hosts and the sandbox this was built in). When that happens, candle history falls back
  to OKX automatically. The venue label in the header always shows which source is live
  (`BINANCE` + `CHART OKX` means Binance is streaming and OKX is supplying candles).
- The **Market data** tab has a provenance panel showing a real per-venue probe, including a live
  WebSocket handshake, plus a latency benchmark.

## Running it

Requires Node.js 20+ (developed on 24) and a network path to Binance or OKX.

```bash
git clone https://github.com/coderabhishek672-stack/akoilsytfgylo.git
cd akoilsytfgylo
npm install
npm run build
npm start
```

Then open http://localhost:3000.

To use a different port:

```bash
PORT=12000 npm start
```

There is also a convenience script that starts the server detached and waits until it responds:

```bash
./run-terminal.sh          # defaults to port 12000
PORT=3000 ./run-terminal.sh
```

### Development

```bash
npm run dev      # http://localhost:3000
npx tsc --noEmit # typecheck
```

## Architecture

```
app/
  page.tsx                        terminal shell
  api/market/route.ts             top-level snapshot
  api/market/candles/route.ts     OHLCV history
  api/market/instrument/route.ts  tick size, contract unit
  api/market/signals/route.ts     full multi-timeframe signal picture
  api/market/sources/route.ts     venue provenance + probes
components/terminal/
  terminal.tsx                    layout and timeframe state
  price-chart.tsx                 candlesticks, overlays, preview levels
  signal-lock.tsx                 lock panel, gates, levels
  market-panels.tsx               indicators, order book, tape, derivatives
  sources-panel.tsx               feed provenance
  methodology-dialog.tsx          how the signal is calculated
hooks/
  use-market.ts                   WebSocket feed + REST recovery
  use-signals.ts                  signal polling and live stage re-evaluation
lib/
  exchange.ts                     venue layer, REST mirror walk, OKX fallback
  indicators.ts                   indicator math
  signal-engine.ts                timeline, confluence lookup, replay, locks
  market-types.ts                 shared types
```

### Notes for contributors

- **Historical confluence must be time-aligned.** A lock taken at a past close is evaluated against
  what the other timeframes looked like *at that same moment*, via `ConfluenceLookup`. Do not fall
  back to the current snapshot.
- **A committed lock is frozen.** `lock.levels`, `lock.gates` and `lock.reasons` are captured at lock
  time. The indicator panel shows live values, so a locked timeframe legitimately displays lock-time
  gates next to live indicators. That is not a bug — label it, don't "fix" it.
- **Derived values must not be frozen.** "Market entry now" uses the live price. Frozen text that
  quotes a distance says "at lock time".
- `npx eslint .` can hang in restricted environments; the production build's typecheck is the real
  gate.

## Honesty

This terminal deliberately does **not** claim guaranteed accuracy, a fixed win rate, or "100%
confidence" signals. Such claims are not possible in trading, and any tool making them is misleading
you.

What the confidence number actually means: **weighted agreement** between indicators and timeframes.
It is not a probability of profit. A lock that passes all six gates can still lose — that is why
stops and position sizing matter more than the signal.

The signal activity table is a **deterministic replay of the day's real closed candles**, not a
record of executed trades. Touching a level does not prove an order filled.

Trade only with capital you can afford to lose. This is not financial advice.

## License

MIT
