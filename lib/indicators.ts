/**
 * Deterministic technical-analysis primitives.
 * Every function here is pure and operates only on closed-candle arrays supplied by the caller.
 */

export function sma(values: number[], period: number): number[] {
  if (period <= 0) return []
  const out: number[] = []
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= period) sum -= values[i - period]
    if (i >= period - 1) out.push(sum / period)
  }
  return out
}

export function ema(values: number[], period: number): number[] {
  if (!values.length || period <= 0) return []
  const alpha = 2 / (period + 1)
  const out: number[] = []
  for (let i = 0; i < values.length; i++) {
    out.push(i === 0 ? values[i] : values[i] * alpha + out[i - 1] * (1 - alpha))
  }
  return out
}

export function rma(values: number[], period: number): number[] {
  if (!values.length || period <= 0) return []
  const out: number[] = []
  let seed = 0
  for (let i = 0; i < values.length; i++) {
    if (i < period) {
      seed += values[i]
      out.push(seed / (i + 1))
    } else {
      out.push((out[i - 1] * (period - 1) + values[i]) / period)
    }
  }
  return out
}

/** Wilder RSI. Returns an array aligned to the input. */
export function rsi(values: number[], period = 14): number[] {
  if (values.length < 2) return values.map(() => 50)
  const gains: number[] = [0]
  const losses: number[] = [0]
  for (let i = 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1]
    gains.push(Math.max(0, diff))
    losses.push(Math.max(0, -diff))
  }
  const avgGain = rma(gains.slice(1), period)
  const avgLoss = rma(losses.slice(1), period)
  const out: number[] = [50]
  for (let i = 0; i < avgGain.length; i++) {
    const g = avgGain[i]
    const l = avgLoss[i]
    out.push(l === 0 ? (g === 0 ? 50 : 100) : 100 - 100 / (1 + g / l))
  }
  return out
}

export function trueRange(candles: { high: number; low: number; close: number }[]): number[] {
  return candles.map((candle, index) => {
    if (index === 0) return candle.high - candle.low
    const previous = candles[index - 1].close
    return Math.max(candle.high - candle.low, Math.abs(candle.high - previous), Math.abs(candle.low - previous))
  })
}

export function atr(candles: { high: number; low: number; close: number }[], period = 14): number[] {
  return rma(trueRange(candles), period)
}

export type MacdResult = { macd: number[]; signal: number[]; histogram: number[] }

export function macd(values: number[], fast = 12, slow = 26, signalPeriod = 9): MacdResult {
  const fastLine = ema(values, fast)
  const slowLine = ema(values, slow)
  const macdLine = fastLine.map((value, index) => value - slowLine[index])
  const signalLine = ema(macdLine, signalPeriod)
  return { macd: macdLine, signal: signalLine, histogram: macdLine.map((value, index) => value - signalLine[index]) }
}

export type BollingerResult = { upper: number[]; middle: number[]; lower: number[]; width: number[]; percentB: number[] }

export function bollinger(values: number[], period = 20, multiplier = 2): BollingerResult {
  const middle = sma(values, period)
  const upper: number[] = []
  const lower: number[] = []
  const width: number[] = []
  const percentB: number[] = []
  for (let i = 0; i < middle.length; i++) {
    const window = values.slice(i, i + period)
    const mean = middle[i]
    const variance = window.reduce((sum, value) => sum + (value - mean) ** 2, 0) / period
    const deviation = Math.sqrt(variance)
    const up = mean + multiplier * deviation
    const down = mean - multiplier * deviation
    upper.push(up)
    lower.push(down)
    width.push(mean === 0 ? 0 : ((up - down) / mean) * 100)
    percentB.push(up === down ? 50 : ((values[i + period - 1] - down) / (up - down)) * 100)
  }
  return { upper, middle, lower, width, percentB }
}

export type StochasticResult = { k: number[]; d: number[] }

export function stochastic(candles: { high: number; low: number; close: number }[], kPeriod = 14, dPeriod = 3): StochasticResult {
  const raw: number[] = []
  for (let i = 0; i < candles.length; i++) {
    if (i < kPeriod - 1) continue
    const window = candles.slice(i - kPeriod + 1, i + 1)
    const highest = Math.max(...window.map(candle => candle.high))
    const lowest = Math.min(...window.map(candle => candle.low))
    raw.push(highest === lowest ? 50 : ((candles[i].close - lowest) / (highest - lowest)) * 100)
  }
  return { k: raw, d: sma(raw, dPeriod) }
}

export type AdxResult = { adx: number[]; plusDI: number[]; minusDI: number[] }

export function adx(candles: { high: number; low: number; close: number }[], period = 14): AdxResult {
  if (candles.length < period + 2) return { adx: [], plusDI: [], minusDI: [] }
  const plusDM: number[] = [0]
  const minusDM: number[] = [0]
  for (let i = 1; i < candles.length; i++) {
    const up = candles[i].high - candles[i - 1].high
    const down = candles[i - 1].low - candles[i].low
    plusDM.push(up > down && up > 0 ? up : 0)
    minusDM.push(down > up && down > 0 ? down : 0)
  }
  const tr = rma(trueRange(candles), period)
  const plus = rma(plusDM, period)
  const minus = rma(minusDM, period)
  const plusDI = plus.map((value, index) => (tr[index] === 0 ? 0 : (value / tr[index]) * 100))
  const minusDI = minus.map((value, index) => (tr[index] === 0 ? 0 : (value / tr[index]) * 100))
  const dx = plusDI.map((value, index) => {
    const sum = value + minusDI[index]
    return sum === 0 ? 0 : (Math.abs(value - minusDI[index]) / sum) * 100
  })
  return { adx: rma(dx, period), plusDI, minusDI }
}

export type SupertrendResult = { line: number[]; direction: number[] }

export function supertrend(candles: { high: number; low: number; close: number }[], period = 10, multiplier = 3): SupertrendResult {
  const ranges = atr(candles, period)
  const line: number[] = []
  const direction: number[] = []
  let upperBand = 0
  let lowerBand = 0
  let trend = 1
  for (let i = 0; i < candles.length; i++) {
    const range = ranges[i]
    const mid = (candles[i].high + candles[i].low) / 2
    const upper = mid + multiplier * range
    const lower = mid - multiplier * range
    if (i === 0) {
      upperBand = upper
      lowerBand = lower
    } else {
      upperBand = candles[i - 1].close > upperBand ? Math.max(upper, upperBand) : upper
      lowerBand = candles[i - 1].close < lowerBand ? Math.min(lower, lowerBand) : lower
    }
    if (trend === 1 && candles[i].close < lowerBand) trend = -1
    else if (trend === -1 && candles[i].close > upperBand) trend = 1
    line.push(trend === 1 ? lowerBand : upperBand)
    direction.push(trend)
  }
  return { line, direction }
}

/** Session-anchored VWAP with a rolling fallback window. */
export function rollingVwap(candles: { high: number; low: number; close: number; volume: number }[], window = 50): number {
  const slice = candles.slice(-window)
  const volume = slice.reduce((sum, candle) => sum + candle.volume, 0)
  if (volume <= 0) return slice.length ? slice[slice.length - 1].close : 0
  const total = slice.reduce((sum, candle) => sum + ((candle.high + candle.low + candle.close) / 3) * candle.volume, 0)
  return total / volume
}

export type SwingPoint = { index: number; price: number; type: 'HIGH' | 'LOW' }

export function swings(candles: { high: number; low: number }[], lookback = 2): SwingPoint[] {
  const points: SwingPoint[] = []
  for (let i = lookback; i < candles.length - lookback; i++) {
    const window = candles.slice(i - lookback, i + lookback + 1)
    if (candles[i].high >= Math.max(...window.map(candle => candle.high))) points.push({ index: i, price: candles[i].high, type: 'HIGH' })
    if (candles[i].low <= Math.min(...window.map(candle => candle.low))) points.push({ index: i, price: candles[i].low, type: 'LOW' })
  }
  return points
}

export function highest(values: number[]): number {
  return values.length ? Math.max(...values) : 0
}

export function lowest(values: number[]): number {
  return values.length ? Math.min(...values) : 0
}

/** Round a price onto an exchange tick so levels are always orderable. */
export function roundToTick(value: number, tick: number, mode: 'floor' | 'ceil' | 'round' = 'round'): number {
  if (!Number.isFinite(value) || !Number.isFinite(tick) || tick <= 0) return value
  const decimals = Math.min(12, Math.max(0, Math.ceil(-Math.log10(tick))))
  const scaled = value / tick
  const factor = Math.pow(10, 6)
  const snapped = Math[mode](Math.round(scaled * factor) / factor) * tick
  return Number(snapped.toFixed(decimals))
}

export function roundToStep(value: number, step: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return value
  const decimals = Math.min(12, Math.max(0, Math.ceil(-Math.log10(step))))
  return Number((Math.floor(value / step) * step).toFixed(decimals))
}
