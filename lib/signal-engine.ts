/**
 * Multi-timeframe scalping signal engine.
 *
 * Design rules:
 *  - Only closed candles may change a direction. The live price can only invalidate or trigger.
 *  - Every timeframe is scored independently, then combined into a confluence ladder.
 *  - A "Signal Lock" is a frozen decision: direction, entry, stop and targets stop moving once locked.
 *  - Confidence is a weighted agreement score. It is not a probability of profit.
 */

import {
  adx as adxSeries,
  atr as atrSeries,
  bollinger,
  ema,
  highest,
  lowest,
  macd as macdSeries,
  rollingVwap,
  rsi as rsiSeries,
  roundToTick,
  sma,
  stochastic,
  supertrend,
} from './indicators'
import {
  CONTEXT_TFS,
  TF_MS,
  type Bias,
  type Candle,
  type Confluence,
  type ConfluenceLookup,
  type Direction,
  type IndicatorReading,
  type IndicatorTimeline,
  type LockEvaluation,
  type LockGate,
  type SignalEvent,
  type SignalLock,
  type Timeframe,
  type TimeframeAnalysis,
  type TimeframeIndicators,
  type TradeLevels,
} from './market-types'

export const WARMUP = 215
const REPLAY_LIMIT = 240
const SWING_WINDOW = 20
const LOCK_BARS: Record<Timeframe, number> = { '1m': 20, '3m': 15, '5m': 12, '15m': 8, '30m': 6, '1h': 5, '3h': 4 }
const COOLDOWN_BARS = 3

type Series = {
  ema9: number[]
  ema21: number[]
  ema50: number[]
  ema200: number[]
  sma20: number[]
  rsi: number[]
  atr: number[]
  macd: number[]
  macdSignal: number[]
  macdHistogram: number[]
  bbUpper: number[]
  bbMiddle: number[]
  bbLower: number[]
  bbWidth: number[]
  bbPercentB: number[]
  stochK: number[]
  stochD: number[]
  adx: number[]
  plusDI: number[]
  minusDI: number[]
  supertrendLine: number[]
  supertrendDirection: number[]
  vwap: number[]
  relativeVolume: number[]
  structure: Bias[]
  swingHigh: number[]
  swingLow: number[]
}

/** Left-pad a shorter series so every array lines up with the candle array. */
function pad(values: number[], length: number, fill = Number.NaN): number[] {
  if (values.length === length) return values
  if (values.length > length) return values.slice(values.length - length)
  return [...Array(length - values.length).fill(fill), ...values]
}

function buildSeries(candles: Candle[]): Series {
  const closes = candles.map(candle => candle.close)
  const length = candles.length
  const atr = pad(atrSeries(candles, 14), length)
  const macdResult = macdSeries(closes)
  const bands = bollinger(closes, 20, 2)
  const stoch = stochastic(candles, 14, 3)
  const directional = adxSeries(candles, 14)
  const trend = supertrend(candles, 10, 3)
  const volumeAverage = pad(sma(candles.map(candle => candle.volume), 20), length)

  // Rolling 50-bar VWAP, recomputed only at each index so replays stay deterministic.
  const vwap: number[] = []
  for (let i = 0; i < length; i++) vwap.push(rollingVwap(candles.slice(Math.max(0, i - 49), i + 1), 50))

  const relativeVolume = candles.map((candle, index) => {
    const average = volumeAverage[index]
    return Number.isFinite(average) && average > 0 ? candle.volume / average : 1
  })

  const swingHigh: number[] = []
  const swingLow: number[] = []
  const structure: Bias[] = []
  for (let i = 0; i < length; i++) {
    const window = candles.slice(Math.max(0, i - SWING_WINDOW + 1), i + 1)
    const half = Math.max(1, Math.floor(window.length / 2))
    const earlierHigh = highest(window.slice(0, half).map(candle => candle.high))
    const laterHigh = highest(window.slice(half).map(candle => candle.high))
    const earlierLow = lowest(window.slice(0, half).map(candle => candle.low))
    const laterLow = lowest(window.slice(half).map(candle => candle.low))
    swingHigh.push(laterHigh)
    swingLow.push(laterLow)
    structure.push(
      laterHigh > earlierHigh && laterLow > earlierLow
        ? 'BULLISH'
        : laterHigh < earlierHigh && laterLow < earlierLow
          ? 'BEARISH'
          : 'NEUTRAL',
    )
  }

  return {
    ema9: pad(ema(closes, 9), length),
    ema21: pad(ema(closes, 21), length),
    ema50: pad(ema(closes, 50), length),
    ema200: pad(ema(closes, 200), length),
    sma20: pad(sma(closes, 20), length),
    rsi: pad(rsiSeries(closes, 14), length),
    atr,
    macd: pad(macdResult.macd, length),
    macdSignal: pad(macdResult.signal, length),
    macdHistogram: pad(macdResult.histogram, length),
    bbUpper: pad(bands.upper, length),
    bbMiddle: pad(bands.middle, length),
    bbLower: pad(bands.lower, length),
    bbWidth: pad(bands.width, length),
    bbPercentB: pad(bands.percentB, length),
    stochK: pad(stoch.k, length),
    stochD: pad(stoch.d, length),
    adx: pad(directional.adx, length),
    plusDI: pad(directional.plusDI, length),
    minusDI: pad(directional.minusDI, length),
    supertrendLine: pad(trend.line, length),
    supertrendDirection: pad(trend.direction, length),
    vwap,
    relativeVolume,
    structure,
    swingHigh,
    swingLow,
  }
}

const directionOf = (value: number, deadband: number): Direction =>
  value > deadband ? 'LONG' : value < -deadband ? 'SHORT' : 'NEUTRAL'

const biasOf = (score: number): Bias => (score >= 45 ? 'BULLISH' : score <= -45 ? 'BEARISH' : 'NEUTRAL')

const at = (series: number[], index: number, fallback = 0) => {
  const value = series[index]
  return Number.isFinite(value) ? value : fallback
}

function readingsAt(candles: Candle[], series: Series, index: number): { readings: IndicatorReading[]; score: number } {
  const candle = candles[index]
  const price = candle.close
  const atr = at(series.atr, index, price * 0.001)
  const ema9 = at(series.ema9, index, price)
  const ema21 = at(series.ema21, index, price)
  const ema50 = at(series.ema50, index, price)
  const ema200 = at(series.ema200, index, price)
  const rsi = at(series.rsi, index, 50)
  const macdHistogram = at(series.macdHistogram, index)
  const macdHistogramPrev = at(series.macdHistogram, index - 1, macdHistogram)
  const vwap = at(series.vwap, index, price)
  const bbUpper = at(series.bbUpper, index, price)
  const bbLower = at(series.bbLower, index, price)
  const bbPercentB = at(series.bbPercentB, index, 50)
  const stochK = at(series.stochK, index, 50)
  const stochD = at(series.stochD, index, 50)
  const adxValue = at(series.adx, index)
  const plusDI = at(series.plusDI, index)
  const minusDI = at(series.minusDI, index)
  const supertrendDirection = at(series.supertrendDirection, index, 0) >= 0 ? 'LONG' : 'SHORT'
  const relativeVolume = at(series.relativeVolume, index, 1)
  const structure = series.structure[index] ?? 'NEUTRAL'
  const deadband = atr * 0.1

  // A fast 9/21/50 stack plus the 200-period regime filter.
  const stack = ema9 > ema21 && ema21 > ema50 ? 'LONG' : ema9 < ema21 && ema21 < ema50 ? 'SHORT' : directionOf(ema9 - ema21, deadband)
  const regime = directionOf(price - ema200, atr * 0.35)
  const macdDirection = directionOf(macdHistogram, atr * 0.02)
  const momentumDirection = macdHistogram > macdHistogramPrev && macdDirection === 'LONG' ? 'LONG' : macdHistogram < macdHistogramPrev && macdDirection === 'SHORT' ? 'SHORT' : macdDirection
  const trendDirection: Direction = supertrendDirection
  const diDirection = directionOf(plusDI - minusDI, 2)
  const adxWeighted: Direction = adxValue < 15 ? 'NEUTRAL' : diDirection
  const vwapDirection = directionOf(price - vwap, atr * 0.15)
  const rsiDirection: Direction = rsi >= 55 && rsi <= 78 ? 'LONG' : rsi <= 45 && rsi >= 22 ? 'SHORT' : rsi > 78 ? 'NEUTRAL' : rsi < 22 ? 'NEUTRAL' : 'NEUTRAL'
  const stochDirection: Direction = stochK > stochD && stochK < 82 ? 'LONG' : stochK < stochD && stochK > 18 ? 'SHORT' : 'NEUTRAL'
  const bbDirection: Direction = bbPercentB > 52 && bbPercentB < 100 ? 'LONG' : bbPercentB < 48 && bbPercentB > 0 ? 'SHORT' : 'NEUTRAL'
  const structureDirection: Direction = structure === 'BULLISH' ? 'LONG' : structure === 'BEARISH' ? 'SHORT' : 'NEUTRAL'

  const readings: IndicatorReading[] = [
    { name: 'EMA stack', detail: 'EMA 9 / 21 / 50 alignment', value: ema9 - ema50, display: `${ema9.toFixed(2)} · ${ema21.toFixed(2)} · ${ema50.toFixed(2)}`, direction: stack, weight: 1.6 },
    { name: 'Trend regime', detail: 'Price vs EMA 200', value: price - ema200, display: ema200.toFixed(2), direction: regime, weight: 1.2 },
    { name: 'MACD momentum', detail: 'Histogram 12 / 26 / 9', value: macdHistogram, display: macdHistogram.toFixed(3), direction: momentumDirection, weight: 1.3 },
    { name: 'Supertrend', detail: 'ATR 10 × 3.0', value: at(series.supertrendLine, index, price), display: at(series.supertrendLine, index, price).toFixed(2), direction: trendDirection, weight: 1.5 },
    { name: 'ADX / DI', detail: `ADX ${adxValue.toFixed(1)}`, value: plusDI - minusDI, display: `+DI ${plusDI.toFixed(1)} / -DI ${minusDI.toFixed(1)}`, direction: adxWeighted, weight: 1.3 },
    { name: 'RSI', detail: 'Wilder RSI 14', value: rsi, display: rsi.toFixed(1), direction: rsiDirection, weight: 1.0 },
    { name: 'VWAP', detail: 'Rolling 50-bar VWAP', value: price - vwap, display: vwap.toFixed(2), direction: vwapDirection, weight: 1.1 },
    { name: 'Market structure', detail: '20-bar swing sequence', value: price, display: structure, direction: structureDirection, weight: 1.3 },
    { name: 'Bollinger position', detail: '%B of 20-period bands', value: bbPercentB, display: `${bbLower.toFixed(1)} – ${bbUpper.toFixed(1)}`, direction: bbDirection, weight: 0.8 },
    { name: 'Stochastic', detail: 'K 14 / D 3', value: stochK - stochD, display: `K ${stochK.toFixed(1)} / D ${stochD.toFixed(1)}`, direction: stochDirection, weight: 0.8 },
  ]

  // Relative volume confirms the move but never picks a side on its own.
  if (relativeVolume >= 1.15) {
    const confirm: Direction = stack === 'LONG' ? 'LONG' : stack === 'SHORT' ? 'SHORT' : 'NEUTRAL'
    readings.push({ name: 'Relative volume', detail: 'Volume vs 20-bar average', value: relativeVolume, display: `${relativeVolume.toFixed(2)}×`, direction: confirm, weight: 0.6 })
  }

  const totalWeight = readings.reduce((sum, reading) => sum + reading.weight, 0)
  const weighted = readings.reduce(
    (sum, reading) => sum + reading.weight * (reading.direction === 'LONG' ? 1 : reading.direction === 'SHORT' ? -1 : 0),
    0,
  )
  const score = totalWeight > 0 ? Math.round((weighted / totalWeight) * 100) : 0
  return { readings, score }
}

export function indicatorsAt(candles: Candle[], timeframe: Timeframe, series?: Series, index = candles.length - 1): TimeframeIndicators | null {
  if (candles.length < WARMUP) return null
  const built = series ?? buildSeries(candles)
  const candle = candles[index]
  if (!candle) return null
  const atr = at(built.atr, index, 0)
  if (!(atr > 0) || !(candle.close > 0)) return null
  const { readings, score } = readingsAt(candles, built, index)
  const bbUpper = at(built.bbUpper, index, candle.close)
  const bbLower = at(built.bbLower, index, candle.close)
  const bbMiddle = at(built.bbMiddle, index, candle.close)
  return {
    timeframe,
    price: candle.close,
    ema9: at(built.ema9, index, candle.close),
    ema21: at(built.ema21, index, candle.close),
    ema50: at(built.ema50, index, candle.close),
    ema200: at(built.ema200, index, candle.close),
    sma20: at(built.sma20, index, candle.close),
    rsi: at(built.rsi, index, 50),
    atr,
    atrPct: (atr / candle.close) * 100,
    macd: at(built.macd, index),
    macdSignal: at(built.macdSignal, index),
    macdHistogram: at(built.macdHistogram, index),
    macdHistogramPrev: at(built.macdHistogram, index - 1),
    vwap: at(built.vwap, index, candle.close),
    bbUpper,
    bbMiddle,
    bbLower,
    bbWidth: at(built.bbWidth, index),
    bbPercentB: at(built.bbPercentB, index, 50),
    stochK: at(built.stochK, index, 50),
    stochD: at(built.stochD, index, 50),
    adx: at(built.adx, index),
    plusDI: at(built.plusDI, index),
    minusDI: at(built.minusDI, index),
    supertrend: at(built.supertrendLine, index, candle.close),
    supertrendDirection: at(built.supertrendDirection, index, 0) >= 0 ? 'LONG' : 'SHORT',
    relativeVolume: at(built.relativeVolume, index, 1),
    structure: built.structure[index] ?? 'NEUTRAL',
    swingHigh: at(built.swingHigh, index, candle.high),
    swingLow: at(built.swingLow, index, candle.low),
    score,
    bias: biasOf(score),
    readings,
  }
}

/** Weighted agreement of every timeframe against a proposed direction, expressed as -1…1. */
export function agreementOf(confluences: Confluence[]): number {
  const total = confluences.reduce((sum, entry) => sum + entry.weight, 0)
  if (total <= 0) return 0
  const weighted = confluences.reduce(
    (sum, entry) => sum + entry.weight * (entry.bias === 'NEUTRAL' ? 0 : entry.aligned ? 1 : -1),
    0,
  )
  return weighted / total
}

const TF_WEIGHT: Record<Timeframe, number> = { '1m': 0.6, '3m': 0.8, '5m': 1.0, '15m': 1.3, '30m': 1.4, '1h': 1.6, '3h': 1.8 }

export function buildConfluences(indicators: Partial<Record<Timeframe, TimeframeIndicators | null>>, direction: 'LONG' | 'SHORT'): Confluence[] {
  return (Object.keys(indicators) as Timeframe[])
    .map(timeframe => {
      const reading = indicators[timeframe]
      const bias: Bias = reading ? reading.bias : 'NEUTRAL'
      return {
        timeframe,
        bias,
        score: reading?.score ?? 0,
        weight: TF_WEIGHT[timeframe],
        aligned: alignedFor({ bias }, direction),
      }
    })
    .sort((a, b) => TF_WEIGHT[b.timeframe] - TF_WEIGHT[a.timeframe])
}

/** A timeframe only counts as agreement when it leans the same way with real conviction. */
function alignedFor(entry: Pick<Confluence, 'bias'>, direction: 'LONG' | 'SHORT'): boolean {
  return direction === 'LONG' ? entry.bias === 'BULLISH' : entry.bias === 'BEARISH'
}

function gradeFor(confidence: number, agreement: number, adx: number, relativeVolume: number, alignedCount: number, total: number): 'A+' | 'A' | 'B' | 'C' {
  const breadth = total > 0 ? alignedCount / total : 0
  if (confidence >= 88 && agreement >= 0.6 && breadth >= 0.7 && adx >= 22 && relativeVolume >= 1.0) return 'A+'
  if (confidence >= 78 && agreement >= 0.45 && breadth >= 0.55 && adx >= 18) return 'A'
  if (confidence >= 68 && agreement >= 0.25) return 'B'
  return 'C'
}

function buildLevels(indicators: TimeframeIndicators, direction: 'LONG' | 'SHORT', tick: number, price: number): TradeLevels {
  const long = direction === 'LONG'
  const atr = indicators.atr

  // Ideal entry is the nearest confluence of value anchors on the retracement side of price.
  const anchors = [indicators.ema21, indicators.vwap, indicators.bbMiddle, indicators.ema50].filter(value => value > 0)
  const candidates = anchors.filter(value => (long ? value <= price : value >= price))
  const idealRaw = candidates.length
    ? long
      ? Math.max(...candidates)
      : Math.min(...candidates)
    : anchors.length
      ? anchors.reduce((sum, value) => sum + value, 0) / anchors.length
      : price

  const idealEntry = roundToTick(idealRaw, tick, long ? 'floor' : 'ceil')
  const aggressiveEntry = roundToTick(price, tick, long ? 'ceil' : 'floor')

  const structureStop = long
    ? Math.min(indicators.swingLow - atr * 0.35, idealEntry - atr * 1.2)
    : Math.max(indicators.swingHigh + atr * 0.35, idealEntry + atr * 1.2)
  const atrStop = long ? idealEntry - atr * 1.6 : idealEntry + atr * 1.6
  // Keep the wider (safer) of the two, but never risk more than 2.6 ATR on a scalp.
  const stopRaw = long ? Math.min(structureStop, atrStop) : Math.max(structureStop, atrStop)
  const cappedStop = long ? Math.max(stopRaw, idealEntry - atr * 2.6) : Math.min(stopRaw, idealEntry + atr * 2.6)
  const stopLoss = roundToTick(cappedStop, tick, long ? 'floor' : 'ceil')

  const risk = Math.abs(idealEntry - stopLoss) || atr
  const multiples = [1, 2, 3]
  const targets = multiples.map(multiple => roundToTick(idealEntry + (long ? 1 : -1) * risk * multiple, tick, long ? 'ceil' : 'floor'))
  const riskReward = multiples

  return {
    direction,
    idealEntry,
    aggressiveEntry,
    stopLoss,
    targets,
    riskReward,
    riskPerUnit: risk,
    zoneLow: roundToTick(idealEntry - atr * 0.12, tick, 'floor'),
    zoneHigh: roundToTick(idealEntry + atr * 0.12, tick, 'ceil'),
  }
}

export type LockInput = {
  timeframe: Timeframe
  indicators: TimeframeIndicators
  /** Resolves what every other timeframe looked like at the given moment. */
  lookup: ConfluenceLookup
  tick: number
  price: number
  time: number
}

export function evaluateLock(input: LockInput): LockEvaluation {
  const { indicators, timeframe, tick, price, time } = input
  const score = indicators.score
  const direction: 'LONG' | 'SHORT' = score >= 0 ? 'LONG' : 'SHORT'

  const confluences = buildConfluences(input.lookup(time), direction)
  const agreement = agreementOf(confluences)
  const alignmentPct = Math.round(((agreement + 1) / 2) * 100)
  const alignedCount = confluences.filter(entry => alignedFor(entry, direction)).length
  const fastAligned = confluences.filter(entry => !CONTEXT_TFS.includes(entry.timeframe) && alignedFor(entry, direction)).length

  let confidence = Math.round(Math.abs(score) * 0.5 + alignmentPct * 0.5)
  if (agreement < 0.25) confidence = Math.min(confidence, 55)
  if (indicators.structure !== (direction === 'LONG' ? 'BULLISH' : 'BEARISH') && indicators.structure !== 'NEUTRAL') confidence -= 6
  confidence = Math.max(0, Math.min(100, confidence))

  const gates: LockGate[] = [
    {
      name: 'Timeframe score',
      pass: Math.abs(score) >= 60,
      detail: `${timeframe.toUpperCase()} score ${score > 0 ? '+' : ''}${score} (needs ±60)`,
    },
    {
      name: 'Multi-timeframe confluence',
      pass: agreement >= 0.25,
      detail: `${alignedCount} of ${confluences.length} aligned · ${alignmentPct}% weighted agreement (needs ≥ 62%)`,
    },
    {
      name: 'Trend strength',
      pass: indicators.adx >= 18,
      detail: `ADX ${indicators.adx.toFixed(1)} (needs ≥ 18)`,
    },
    {
      name: 'Market structure',
      pass: indicators.structure !== (direction === 'LONG' ? 'BEARISH' : 'BULLISH'),
      detail: `Structure is ${indicators.structure.toLowerCase()}`,
    },
    {
      name: 'Volume participation',
      pass: indicators.relativeVolume >= 0.75,
      detail: `${indicators.relativeVolume.toFixed(2)}× the 20-bar average (needs ≥ 0.75×)`,
    },
    {
      name: 'Breadth of agreement',
      pass: alignedCount >= Math.ceil(confluences.length * 0.4),
      detail: `${alignedCount} of ${confluences.length} timeframes aligned (needs ≥ ${Math.ceil(confluences.length * 0.4)})`,
    },
  ]

  const passed = gates.filter(gate => gate.pass).length
  const total = gates.length

  // Below the arming threshold there is no committed direction, so no levels are previewed.
  if (Math.abs(score) < 50) {
    return {
      lock: null,
      gates,
      direction: null,
      confidence,
      previewLevels: null,
      reason: `No timeframe score above the arming threshold (${score > 0 ? '+' : ''}${score}).`,
    }
  }

  const previewLevels = buildLevels(indicators, direction, tick, price)

  const levels = previewLevels
  const distanceToEntry = Math.abs(price - levels.idealEntry)
  const withinReach = distanceToEntry <= indicators.atr * 1.5

  const reasons: string[] = []
  const warnings: string[] = []

  if (Math.abs(score) >= 60) {
    const alignedFactors = indicators.readings.filter(reading => reading.direction === (direction === 'LONG' ? 'LONG' : 'SHORT')).length
    reasons.push(`${timeframe.toUpperCase()} score ${score > 0 ? '+' : ''}${score} with ${alignedFactors} of ${indicators.readings.length} factors aligned`)
  }
  if (indicators.supertrendDirection === direction) reasons.push(`Supertrend is ${direction === 'LONG' ? 'bullish' : 'bearish'} at ${indicators.supertrend.toFixed(2)}`)
  if (indicators.adx >= 20) reasons.push(`ADX ${indicators.adx.toFixed(1)} confirms directional strength`)
  if (indicators.structure === (direction === 'LONG' ? 'BULLISH' : 'BEARISH')) {
    reasons.push(`Market structure shows ${direction === 'LONG' ? 'higher highs and higher lows' : 'lower highs and lower lows'}`)
  }
  if (indicators.relativeVolume >= 1.15) reasons.push(`Volume is ${indicators.relativeVolume.toFixed(2)}× the 20-bar average`)
  if (agreement >= 0.25) reasons.push(`${alignedCount} of ${confluences.length} timeframes agree`)

  if (indicators.adx < 18) warnings.push(`ADX ${indicators.adx.toFixed(1)} is below 18 — the market may be ranging`)
  if (indicators.relativeVolume < 0.8) warnings.push('Volume is below its 20-bar average — participation is thin')
  if (!withinReach) warnings.push(`Entry is ${distanceToEntry.toFixed(2)} away at lock time (${(distanceToEntry / indicators.atr).toFixed(1)} ATR) — wait for a pullback`)
  if (indicators.atrPct > 1.2) warnings.push(`Volatility is elevated at ${indicators.atrPct.toFixed(2)}% of price`)
  if (agreement < 0.25) warnings.push('Higher timeframes do not confirm — this is a counter-trend scalp')
  if (fastAligned === 0) warnings.push('No fast timeframe agrees with this direction')

  if (passed < total) {
    return {
      lock: null,
      gates,
      direction,
      confidence,
      previewLevels,
      reason: `Arming — ${passed}/${total} lock gates passed. Pending: ${gates.filter(gate => !gate.pass).map(gate => gate.name.toLowerCase()).join(', ')}.`,
    }
  }

  const grade = gradeFor(confidence, agreement, indicators.adx, indicators.relativeVolume, alignedCount, confluences.length)
  const bars = LOCK_BARS[timeframe]
  const expiresTime = time + bars * TF_MS[timeframe]

  return {
    lock: {
      id: `${timeframe}-${direction}-${time}`,
      timeframe,
      direction,
      stage: 'LOCKED',
      grade,
      confidence,
      confluences,
      levels,
      gates,
      reasons: reasons.slice(0, 6),
      warnings: warnings.slice(0, 4),
      createdTime: time,
      expiresTime,
      priceAtLock: price,
      distanceToEntry,
      progress: 0,
      lockedAt: time,
    },
    gates,
    direction,
    confidence,
    previewLevels: levels,
    reason: `Signal locked — grade ${grade} · ${confidence}% confidence`,
  }
}

/**
 * Builds an indexed indicator timeline for one timeframe so historical confluence can be
 * resolved by close time instead of by "whatever the other timeframes look like right now".
 */
export function buildTimeline(candles: Candle[], timeframe: Timeframe): IndicatorTimeline {
  const closed = candles.filter(candle => candle.closed)
  const times: number[] = []
  const readings: (TimeframeIndicators | null)[] = []
  if (closed.length < WARMUP) return { timeframe, times, readings }
  const series = buildSeries(closed)
  for (let index = 0; index < closed.length; index++) {
    times.push(closed[index].time + TF_MS[timeframe])
    readings.push(index < WARMUP - 1 ? null : indicatorsAt(closed, timeframe, series, index))
  }
  return { timeframe, times, readings }
}

/** Newest closed reading at or before `time`, falling back to the earliest available. */
function readingAt(timeline: IndicatorTimeline, time: number): TimeframeIndicators | null {
  let low = 0
  let high = timeline.times.length - 1
  let found = -1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (timeline.times[mid] <= time) {
      found = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  if (found >= 0) return timeline.readings[found]
  const first = timeline.readings.findIndex(reading => reading !== null)
  return first >= 0 ? timeline.readings[first] : null
}

/** Combines per-timeframe timelines into the lookup used by the lock evaluator. */
export function createConfluenceLookup(timelines: IndicatorTimeline[]): ConfluenceLookup {
  return (time: number) => {
    const snapshot: Partial<Record<Timeframe, TimeframeIndicators | null>> = {}
    for (const timeline of timelines) snapshot[timeline.timeframe] = readingAt(timeline, time)
    return snapshot
  }
}

export function consensusOf(analyses: TimeframeAnalysis[]) {
  const usable = analyses.filter(analysis => analysis.indicators)
  let bullish = 0
  let bearish = 0
  let neutral = 0
  let weighted = 0
  let totalWeight = 0
  for (const analysis of usable) {
    const weight = TF_WEIGHT[analysis.timeframe]
    totalWeight += weight
    weighted += weight * analysis.indicators!.score
    if (analysis.indicators!.bias === 'BULLISH') bullish += 1
    else if (analysis.indicators!.bias === 'BEARISH') bearish += 1
    else neutral += 1
  }
  const score = totalWeight > 0 ? Math.round(weighted / totalWeight) : 0
  return {
    bias: biasOf(score),
    score,
    bullish,
    bearish,
    neutral,
    alignment: usable.length ? Math.round((Math.max(bullish, bearish) / usable.length) * 100) : 0,
  }
}

/* ------------------------------------------------------------------ */
/* Per-timeframe analysis with intraday replay                         */
/* ------------------------------------------------------------------ */

type ReplayState = { lock: SignalLock | null; cooldown: number; candidate: Direction; confirmations: number }

function replay(candles: Candle[], series: Series, timeframe: Timeframe, tick: number, now: number, lookup: ConfluenceLookup) {
  const history: SignalEvent[] = []
  const sessionStart = Math.floor(now / 86_400_000) * 86_400_000
  const state: ReplayState = { lock: null, cooldown: 0, candidate: 'NEUTRAL', confirmations: 0 }
  const start = Math.max(WARMUP, candles.length - REPLAY_LIMIT)
  let lastScore = 0
  let lastBias: Bias = 'NEUTRAL'

  for (let i = start; i < candles.length; i++) {
    const candle = candles[i]
    const closeTime = candle.time + TF_MS[timeframe]
    const indicators = indicatorsAt(candles, timeframe, series, i)
    if (!indicators) continue
    lastScore = indicators.score
    lastBias = indicators.bias
    if (closeTime < sessionStart) continue

    if (state.lock) {
      const long = state.lock.direction === 'LONG'
      const stopHit = long ? candle.low <= state.lock.levels.stopLoss : candle.high >= state.lock.levels.stopLoss
      const targetHit = long ? candle.high >= state.lock.levels.targets[2] : candle.low <= state.lock.levels.targets[2]
      const expired = closeTime >= state.lock.expiresTime
      if (stopHit || targetHit || expired) {
        history.push({
          time: closeTime,
          timeframe,
          type: stopHit ? 'INVALIDATED' : targetHit ? 'TARGET HIT' : 'EXPIRED',
          direction: state.lock.direction,
          entry: state.lock.levels.idealEntry,
          grade: state.lock.grade,
          confidence: state.lock.confidence,
        })
        state.lock = null
        state.cooldown = COOLDOWN_BARS
        state.candidate = 'NEUTRAL'
        state.confirmations = 0
      }
      continue
    }

    if (state.cooldown > 0) {
      state.cooldown -= 1
      continue
    }

    const next: Direction = indicators.score >= 50 ? 'LONG' : indicators.score <= -50 ? 'SHORT' : 'NEUTRAL'
    state.confirmations = next === 'NEUTRAL' ? 0 : next === state.candidate ? state.confirmations + 1 : 1
    state.candidate = next
    if (state.confirmations < 2 || state.candidate === 'NEUTRAL') continue

    const evaluated = evaluateLock({ timeframe, indicators, lookup, tick, price: candle.close, time: closeTime })
    if (!evaluated.lock) continue
    state.lock = evaluated.lock
    history.push({
      time: closeTime,
      timeframe,
      type: 'LOCKED',
      direction: evaluated.lock.direction,
      entry: evaluated.lock.levels.idealEntry,
      grade: evaluated.lock.grade,
      confidence: evaluated.lock.confidence,
    })
  }

  return { history: history.slice(-25).reverse(), state, lastScore, lastBias }
}

export function analyzeTimeframe(
  candles: Candle[],
  timeframe: Timeframe,
  tick: number,
  now: number,
  lookup: ConfluenceLookup,
): TimeframeAnalysis {
  const empty: TimeframeAnalysis = { timeframe, indicators: null, lock: null, evaluation: null, confluences: [], candidate: 'NEUTRAL', confirmations: 0, lastClose: null, error: null, history: [] }
  const closed = candles.filter(candle => candle.closed)
  if (closed.length < WARMUP + 2) {
    return { ...empty, error: `Waiting for ${WARMUP + 2} closed ${timeframe} candles (have ${closed.length}).` }
  }

  for (let i = 0; i < closed.length; i++) {
    const candle = closed[i]
    const values = [candle.time, candle.open, candle.high, candle.low, candle.close, candle.volume]
    if (!values.every(Number.isFinite) || candle.low <= 0 || candle.volume < 0) {
      return { ...empty, error: 'Candle integrity check failed. Signals blocked.' }
    }
    if (candle.high < Math.max(candle.open, candle.close) || candle.low > Math.min(candle.open, candle.close)) {
      return { ...empty, error: 'Candle integrity check failed. Signals blocked.' }
    }
    if (i > 0 && candle.time - closed[i - 1].time !== TF_MS[timeframe]) {
      return { ...empty, error: `Gap detected in ${timeframe} candles. Signals blocked.` }
    }
  }

  const lastClose = closed[closed.length - 1].time + TF_MS[timeframe]
  if (now - lastClose > TF_MS[timeframe] * 2.5 + 20_000) {
    return { ...empty, lastClose, error: `Closed ${timeframe} feed is stale. Signals blocked.` }
  }
  if (!(tick > 0)) return { ...empty, lastClose, error: 'Exchange tick size is not verified.' }

  const series = buildSeries(closed)
  const indicators = indicatorsAt(closed, timeframe, series)
  if (!indicators) return { ...empty, lastClose, error: 'Not enough history to compute indicators.' }

  const replayResult = replay(closed, series, timeframe, tick, now, lookup)
  const live = replayResult.state.lock
  const candidate: Direction = live ? live.direction : replayResult.state.candidate
  const confirmations = live ? 2 : replayResult.state.confirmations

  // Live gate panel: what would have to be true right now for this timeframe to lock.
  const liveEvaluation = evaluateLock({
    timeframe,
    indicators,
    lookup,
    tick,
    price: indicators.price,
    time: now,
  })
  // Align the ladder to the direction the engine is actually leaning, so the displayed
  // agreement always matches the gates above it.
  const displayDirection = liveEvaluation.direction ?? liveEvaluation.lock?.direction ?? 'LONG'
  const confluences = liveEvaluation.lock?.confluences ?? buildConfluences(lookup(now), displayDirection)

  return {
    timeframe,
    indicators,
    lock: live,
    evaluation: liveEvaluation,
    confluences,
    candidate,
    confirmations,
    lastClose,
    error: null,
    history: replayResult.history,
  }
}

export { TF_WEIGHT }
