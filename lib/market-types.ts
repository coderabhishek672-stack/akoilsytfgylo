/**
 * Shared market vocabulary for the terminal.
 * Every price and volume in this app comes from a live exchange feed; nothing is simulated.
 */

export const SYMBOL = 'XAUUSDT'
export const BASE = 'XAU'
export const QUOTE = 'USDT'
export const DISPLAY_SYMBOL = 'XAU/USDT'

/** Primary venue: Binance USDⓈ-M perpetual XAUUSDT. */
export const PRIMARY_VENUE = 'BINANCE'

export const TIMEFRAMES = ['1m', '3m', '5m', '15m', '30m', '1h', '3h'] as const
export type Timeframe = (typeof TIMEFRAMES)[number]

export const TF_MS: Record<Timeframe, number> = {
  '1m': 60_000,
  '3m': 180_000,
  '5m': 300_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1h': 3_600_000,
  '3h': 10_800_000,
}

export const TF_LABEL: Record<Timeframe, string> = {
  '1m': '1 min',
  '3m': '3 min',
  '5m': '5 min',
  '15m': '15 min',
  '30m': '30 min',
  '1h': '1 hour',
  '3h': '3 hour',
}

/** Fast timeframes used for the scalp confluence ladder. */
export const SCALP_TFS: Timeframe[] = ['1m', '3m', '5m', '15m']
/** Slower timeframes that provide trend context. */
export const CONTEXT_TFS: Timeframe[] = ['15m', '30m', '1h', '3h']

export type Candle = {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  quoteVolume: number
  trades: number
  closed: boolean
}

export type Ticker = {
  symbol: string
  venue: string
  last: number
  bid: number
  ask: number
  bidSize: number
  askSize: number
  open24h: number
  high24h: number
  low24h: number
  volume24h: number
  quoteVolume24h: number
  changePct24h: number
  ts: number
}

export type BookLevel = { price: number; size: number }

export type OrderBook = {
  bids: BookLevel[]
  asks: BookLevel[]
  ts: number
  venue: string
}

export type Trade = {
  id: string
  price: number
  size: number
  side: 'BUY' | 'SELL'
  ts: number
}

export type Derivatives = {
  markPrice: number | null
  indexPrice: number | null
  fundingRate: number | null
  fundingTime: number | null
  openInterest: number | null
  openInterestUsd: number | null
  ts: number
}

export type Instrument = {
  symbol: string
  venue: string
  state: string
  tickSize: number
  stepSize: number
  minNotional: number
  contractSize: number
  contractUnit: string
  maxLeverage: number | null
  pricePrecision: number
  quantityPrecision: number
}

export type MarketSnapshot = {
  ticker: Ticker | null
  book: OrderBook | null
  derivatives: Derivatives | null
  trades: Trade[]
  venue: string
  receivedAt: number
  latency: number
  errors: string[]
}

export type CandleResponse = {
  candles: Candle[]
  timeframe: Timeframe
  venue: string
  receivedAt: number
  error?: string
}

export type SourceRole = 'primary' | 'fallback' | 'reference' | 'socket'

export type SourceProbe = {
  name: string
  symbol: string
  role: SourceRole
  available: boolean
  latency: number | null
  status: string
  samples: number[]
  last: number | null
}

/* ------------------------------------------------------------------ */
/* Signal engine                                                       */
/* ------------------------------------------------------------------ */

export type Direction = 'LONG' | 'SHORT' | 'NEUTRAL'
export type Bias = 'BULLISH' | 'BEARISH' | 'NEUTRAL'

export type IndicatorReading = {
  name: string
  detail: string
  value: number
  display: string
  direction: Direction
  weight: number
}

export type TimeframeIndicators = {
  timeframe: Timeframe
  price: number
  ema9: number
  ema21: number
  ema50: number
  ema200: number
  sma20: number
  rsi: number
  atr: number
  atrPct: number
  macd: number
  macdSignal: number
  macdHistogram: number
  macdHistogramPrev: number
  vwap: number
  bbUpper: number
  bbMiddle: number
  bbLower: number
  bbWidth: number
  bbPercentB: number
  stochK: number
  stochD: number
  adx: number
  plusDI: number
  minusDI: number
  supertrend: number
  supertrendDirection: Direction
  relativeVolume: number
  structure: Bias
  swingHigh: number
  swingLow: number
  score: number
  bias: Bias
  readings: IndicatorReading[]
}

export type TimeframeSignal = {
  timeframe: Timeframe
  bias: Bias
  score: number
  atr: number
  price: number
  ema21: number
  ema50: number
  rsi: number
  lastClose: number
  error: string | null
}

export type Confluence = {
  timeframe: Timeframe
  bias: Bias
  score: number
  weight: number
  aligned: boolean
}

export type TradeLevels = {
  direction: 'LONG' | 'SHORT'
  idealEntry: number
  aggressiveEntry: number
  stopLoss: number
  targets: number[]
  riskReward: number[]
  riskPerUnit: number
  zoneLow: number
  zoneHigh: number
}

export type LockStage =
  | 'SEARCHING'
  | 'ARMING'
  | 'LOCKED'
  | 'TRIGGERED'
  | 'TARGET HIT'
  | 'INVALIDATED'
  | 'EXPIRED'

export type LockGate = { name: string; pass: boolean; detail: string }

export type SignalLock = {
  id: string
  timeframe: Timeframe
  direction: 'LONG' | 'SHORT'
  stage: LockStage
  grade: 'A+' | 'A' | 'B' | 'C'
  confidence: number
  confluences: Confluence[]
  levels: TradeLevels
  gates: LockGate[]
  reasons: string[]
  warnings: string[]
  createdTime: number
  expiresTime: number
  priceAtLock: number
  distanceToEntry: number
  progress: number
  lockedAt: number | null
}

export type LockEvaluation = {
  lock: SignalLock | null
  gates: LockGate[]
  direction: 'LONG' | 'SHORT' | null
  confidence: number
  /** Levels the engine would lock right now, shown as a preview while the gates are still arming. */
  previewLevels: TradeLevels | null
  reason: string
}

export type SignalEvent = {
  time: number
  timeframe: Timeframe
  type: 'LOCKED' | 'TRIGGERED' | 'TARGET HIT' | 'INVALIDATED' | 'EXPIRED'
  direction: 'LONG' | 'SHORT'
  entry: number
  grade: string
  confidence: number
}

export type TimeframeAnalysis = {
  timeframe: Timeframe
  indicators: TimeframeIndicators | null
  lock: SignalLock | null
  evaluation: LockEvaluation | null
  confluences: Confluence[]
  candidate: Direction
  confirmations: number
  lastClose: number | null
  error: string | null
  history: SignalEvent[]
}

/** Indicator snapshot for one timeframe, indexed by the close time of each candle. */
export type IndicatorTimeline = {
  timeframe: Timeframe
  times: number[]
  readings: (TimeframeIndicators | null)[]
}

/** Resolves the newest closed indicator snapshot of every timeframe at a given moment. */
export type ConfluenceLookup = (time: number) => Partial<Record<Timeframe, TimeframeIndicators | null>>

export type SignalSnapshot = {
  symbol: string
  venue: string
  price: number
  analyses: TimeframeAnalysis[]
  activeTimeframe: Timeframe
  lock: SignalLock | null
  consensus: {
    bias: Bias
    score: number
    bullish: number
    bearish: number
    neutral: number
    alignment: number
  }
  receivedAt: number
  error: string | null
}

/* ------------------------------------------------------------------ */
/* Formatting helpers                                                  */
/* ------------------------------------------------------------------ */

export const isNum = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

export function formatPrice(value: number | string | null | undefined, decimals = 2) {
  const n = Number(value)
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function formatSigned(value: number | null | undefined, decimals = 2) {
  if (!isNum(value)) return '—'
  return `${value > 0 ? '+' : ''}${value.toFixed(decimals)}`
}

export function compact(value: number | string | null | undefined) {
  const n = Number(value)
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n)
}

export function formatTime(ts: number | null | undefined, withSeconds = true) {
  if (!isNum(ts)) return '—'
  const iso = new Date(ts).toISOString()
  return withSeconds ? iso.slice(11, 19) : iso.slice(11, 16)
}

export function formatCountdown(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return '00:00'
  const total = Math.floor(ms / 1000)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`
}
