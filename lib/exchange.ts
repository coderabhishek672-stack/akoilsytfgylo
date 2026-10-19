/**
 * Exchange data access layer.
 *
 * Binance USDⓈ-M perpetual (XAUUSDT) is the primary venue and the preferred source for
 * every number in the terminal. Some hosting regions are blocked from the Binance REST
 * host, so each request walks an ordered list of base URLs and remembers the first one
 * that answers. When no Binance REST host is reachable the layer falls back to the OKX
 * XAU-USDT perpetual, which tracks the same underlying (1 troy ounce of gold), so the
 * terminal keeps streaming real market data instead of showing nothing. The venue that
 * produced each payload is always returned so the UI can label it honestly.
 */

import { SYMBOL, TF_MS, type Candle, type Derivatives, type Instrument, type OrderBook, type Timeframe, type Ticker, type Trade } from './market-types'

const TIMEOUT_MS = 6_000

export type Venue = 'BINANCE' | 'OKX'

type HttpResult<T> = { data: T; venue: Venue; latency: number }

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

async function getJson<T>(url: string, timeout = TIMEOUT_MS): Promise<T> {
  const response = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(timeout),
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new HttpError(response.status, `HTTP ${response.status}${body ? ` — ${body.slice(0, 120)}` : ''}`)
  }
  return (await response.json()) as T
}

/* ------------------------------------------------------------------ */
/* Binance                                                             */
/* ------------------------------------------------------------------ */

/** Ordered REST hosts. The first that answers a request is reused for the session. */
const BINANCE_HOSTS = [
  'https://fapi.binance.com',
  'https://fapi1.binance.com',
  'https://fapi2.binance.com',
  'https://fapi3.binance.com',
  'https://fapi4.binance.com',
]

let preferredHost = 0

async function binance<T>(path: string): Promise<T> {
  const order = [preferredHost, ...BINANCE_HOSTS.keys()].filter((value, index, list) => list.indexOf(value) === index)
  let lastError: unknown = new HttpError(0, 'No Binance host configured')
  for (const index of order) {
    try {
      const result = await getJson<T>(`${BINANCE_HOSTS[index]}${path}`)
      preferredHost = index
      return result
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new HttpError(0, 'Binance unreachable')
}

/** Public market-data-only hosts, used when the trading host is blocked. */
const BINANCE_PUBLIC_HOSTS = ['https://data-api.binance.vision']

async function binancePublic<T>(path: string): Promise<T> {
  let lastError: unknown = new HttpError(0, 'No public Binance host configured')
  for (const host of BINANCE_PUBLIC_HOSTS) {
    try {
      return await getJson<T>(`${host}${path}`)
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new HttpError(0, 'Binance public host unreachable')
}

type BinanceTicker = {
  symbol: string
  lastPrice: string
  bidPrice: string
  askPrice: string
  openPrice: string
  highPrice: string
  lowPrice: string
  volume: string
  quoteVolume: string
  priceChangePercent: string
  closeTime: number
  time: number
}

type BinanceBookTicker = { symbol: string; bidPrice: string; bidQty: string; askPrice: string; askQty: string; time: number }

type BinanceDepth = { lastUpdateId: number; E?: number; T?: number; bids: [string, string][]; asks: [string, string][] }

type BinanceTrade = { id: number; price: string; qty: string; quoteQty: string; time: number; isBuyerMaker: boolean }

type BinanceKline = [number, string, string, string, string, string, number, string, number, string, string, string]

type BinancePremiumIndex = {
  symbol: string
  markPrice: string
  indexPrice: string
  lastFundingRate: string
  nextFundingTime: number
  time: number
}

type BinanceOpenInterest = { openInterest: string; symbol: string; time: number }

type BinanceExchangeInfo = {
  symbols: {
    symbol: string
    pair: string
    contractType: string
    status: string
    baseAsset: string
    quoteAsset: string
    pricePrecision: number
    quantityPrecision: number
    filters: { filterType: string; tickSize?: string; stepSize?: string; notional?: string }[]
  }[]
}

const num = (value: string | number | undefined | null) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/* ------------------------------------------------------------------ */
/* OKX fallback                                                        */
/* ------------------------------------------------------------------ */

const OKX_INSTRUMENT = 'XAU-USDT-SWAP'

async function okx<T>(path: string): Promise<T> {
  const payload = await getJson<{ code: string; msg: string; data: T }>(`https://www.okx.com/api/v5/${path}`)
  if (payload.code !== '0') throw new HttpError(0, payload.msg || 'OKX rejected the request')
  return payload.data
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export type VenuePayload<T> = { data: T; venue: Venue }

async function attempt<T>(primary: () => Promise<T>, fallback: () => Promise<T>): Promise<VenuePayload<T>> {
  try {
    return { data: await primary(), venue: 'BINANCE' }
  } catch (primaryError) {
    try {
      return { data: await fallback(), venue: 'OKX' }
    } catch {
      throw primaryError
    }
  }
}

export async function getInstrument(): Promise<VenuePayload<Instrument>> {
  return attempt(
    async (): Promise<Instrument> => {
      const info = await binance<BinanceExchangeInfo>('/fapi/v1/exchangeInfo')
      const symbol = info.symbols.find(entry => entry.symbol === SYMBOL)
      if (!symbol) throw new HttpError(404, `${SYMBOL} is not listed on Binance USDⓈ-M futures`)
      const tick = symbol.filters.find(filter => filter.filterType === 'PRICE_FILTER')?.tickSize
      const step = symbol.filters.find(filter => filter.filterType === 'LOT_SIZE')?.stepSize
      const notional = symbol.filters.find(filter => filter.filterType === 'MIN_NOTIONAL')?.notional
      return {
        symbol: SYMBOL,
        venue: 'BINANCE' as const,
        state: symbol.status === 'TRADING' ? 'live' : symbol.status.toLowerCase(),
        tickSize: num(tick) || 0.01,
        stepSize: num(step) || 0.001,
        minNotional: num(notional) || 5,
        // Binance XAUUSDT is quoted directly in troy ounces, so one contract is one ounce.
        contractSize: 1,
        contractUnit: 'XAU',
        maxLeverage: null,
        pricePrecision: symbol.pricePrecision ?? 2,
        quantityPrecision: symbol.quantityPrecision ?? 3,
      }
    },
    async (): Promise<Instrument> => {
      const [raw] = await okx<Record<string, string>[]>(`public/instruments?instType=SWAP&instId=${OKX_INSTRUMENT}`)
      if (!raw || raw.instId !== OKX_INSTRUMENT) throw new HttpError(404, 'OKX XAU perpetual unavailable')
      return {
        symbol: SYMBOL,
        venue: 'OKX' as const,
        state: raw.state === 'live' ? 'live' : raw.state,
        tickSize: num(raw.tickSz) || 0.1,
        stepSize: num(raw.lotSz) || 1,
        minNotional: 0,
        contractSize: num(raw.ctVal) || 0.001,
        contractUnit: raw.ctValCcy || 'XAU',
        maxLeverage: num(raw.lever) || null,
        pricePrecision: Math.max(0, Math.ceil(-Math.log10(num(raw.tickSz) || 0.1))),
        quantityPrecision: 0,
      }
    },
  )
}

export async function getTicker(): Promise<VenuePayload<Ticker>> {
  return attempt(
    async (): Promise<Ticker> => {
      const ticker = await binance<BinanceTicker>(`/fapi/v1/ticker/24hr?symbol=${SYMBOL}`)
      return {
        symbol: ticker.symbol,
        venue: 'BINANCE',
        last: num(ticker.lastPrice),
        bid: num(ticker.bidPrice),
        ask: num(ticker.askPrice),
        bidSize: 0,
        askSize: 0,
        open24h: num(ticker.openPrice),
        high24h: num(ticker.highPrice),
        low24h: num(ticker.lowPrice),
        volume24h: num(ticker.volume),
        quoteVolume24h: num(ticker.quoteVolume),
        changePct24h: num(ticker.priceChangePercent),
        ts: ticker.closeTime || ticker.time || Date.now(),
      }
    },
    async (): Promise<Ticker> => {
      const [ticker] = await okx<Record<string, string>[]>(`market/ticker?instId=${OKX_INSTRUMENT}`)
      if (!ticker) throw new HttpError(404, 'OKX ticker unavailable')
      const last = num(ticker.last)
      const open = num(ticker.open24h)
      return {
        symbol: SYMBOL,
        venue: 'OKX',
        last,
        bid: num(ticker.bidPx),
        ask: num(ticker.askPx),
        bidSize: num(ticker.bidSz),
        askSize: num(ticker.askSz),
        open24h: open,
        high24h: num(ticker.high24h),
        low24h: num(ticker.low24h),
        volume24h: num(ticker.volCcy24h),
        quoteVolume24h: num(ticker.volCcy24h) * last,
        changePct24h: open > 0 ? (last / open - 1) * 100 : 0,
        ts: num(ticker.ts),
      }
    },
  )
}

export async function getBook(depth = 20): Promise<VenuePayload<OrderBook>> {
  return attempt(
    async (): Promise<OrderBook> => {
      const book = await binance<BinanceDepth>(`/fapi/v1/depth?symbol=${SYMBOL}&limit=${depth}`)
      return {
        bids: book.bids.map(([price, size]) => ({ price: num(price), size: num(size) })),
        asks: book.asks.map(([price, size]) => ({ price: num(price), size: num(size) })),
        ts: book.T || book.E || Date.now(),
        venue: 'BINANCE',
      }
    },
    async (): Promise<OrderBook> => {
      const [book] = await okx<{ asks: string[][]; bids: string[][]; ts: string }[]>(`market/books?instId=${OKX_INSTRUMENT}&sz=${depth}`)
      if (!book) throw new HttpError(404, 'OKX order book unavailable')
      return {
        bids: book.bids.map(([price, size]) => ({ price: num(price), size: num(size) })),
        asks: book.asks.map(([price, size]) => ({ price: num(price), size: num(size) })),
        ts: num(book.ts),
        venue: 'OKX',
      }
    },
  )
}

export async function getTrades(limit = 40): Promise<VenuePayload<Trade[]>> {
  return attempt(
    async (): Promise<Trade[]> => {
      const trades = await binance<BinanceTrade[]>(`/fapi/v1/trades?symbol=${SYMBOL}&limit=${limit}`)
      return trades
        .map(trade => ({
          id: String(trade.id),
          price: num(trade.price),
          size: num(trade.qty),
          side: (trade.isBuyerMaker ? 'SELL' : 'BUY') as 'BUY' | 'SELL',
          ts: trade.time,
        }))
        .reverse()
    },
    async (): Promise<Trade[]> => {
      const trades = await okx<Record<string, string>[]>(`market/trades?instId=${OKX_INSTRUMENT}&limit=${Math.min(limit, 100)}`)
      return trades
        .map(trade => ({
          id: trade.tradeId,
          price: num(trade.px),
          size: num(trade.sz) * 0.001,
          side: (trade.side === 'buy' ? 'BUY' : 'SELL') as 'BUY' | 'SELL',
          ts: num(trade.ts),
        }))
        .reverse()
    },
  )
}

export async function getDerivatives(): Promise<VenuePayload<Derivatives>> {
  return attempt(
    async (): Promise<Derivatives> => {
      const [premium, interest] = await Promise.all([
        binance<BinancePremiumIndex>(`/fapi/v1/premiumIndex?symbol=${SYMBOL}`),
        binance<BinanceOpenInterest>(`/fapi/v1/openInterest?symbol=${SYMBOL}`),
      ])
      const mark = num(premium.markPrice)
      const openInterest = num(interest.openInterest)
      return {
        markPrice: mark || null,
        indexPrice: num(premium.indexPrice) || null,
        fundingRate: Number.isFinite(Number(premium.lastFundingRate)) ? Number(premium.lastFundingRate) : null,
        fundingTime: premium.nextFundingTime || null,
        openInterest: openInterest || null,
        openInterestUsd: openInterest && mark ? openInterest * mark : null,
        ts: premium.time || Date.now(),
      }
    },
    async (): Promise<Derivatives> => {
      const [mark, funding, interest] = await Promise.all([
        okx<Record<string, string>[]>(`public/mark-price?instType=SWAP&instId=${OKX_INSTRUMENT}`),
        okx<Record<string, string>[]>(`public/funding-rate?instId=${OKX_INSTRUMENT}`),
        okx<Record<string, string>[]>(`public/open-interest?instType=SWAP&instId=${OKX_INSTRUMENT}`),
      ])
      const markPrice = num(mark[0]?.markPx)
      const openInterest = num(interest[0]?.oiCcy)
      return {
        markPrice: markPrice || null,
        indexPrice: null,
        fundingRate: Number.isFinite(Number(funding[0]?.fundingRate)) ? Number(funding[0]?.fundingRate) : null,
        fundingTime: num(funding[0]?.fundingTime) || null,
        openInterest: openInterest || null,
        openInterestUsd: num(interest[0]?.oiUsd) || null,
        ts: num(mark[0]?.ts) || Date.now(),
      }
    },
  )
}

/** Aggregate 1-minute bars up to the requested timeframe (used for 3m, 30m and 3h). */
export function resample(base: Candle[], timeframe: Timeframe): Candle[] {
  const size = TF_MS[timeframe]
  const buckets = new Map<number, Candle>()
  for (const candle of base) {
    const bucket = Math.floor(candle.time / size) * size
    const existing = buckets.get(bucket)
    if (!existing) {
      buckets.set(bucket, { ...candle, time: bucket })
    } else {
      existing.high = Math.max(existing.high, candle.high)
      existing.low = Math.min(existing.low, candle.low)
      existing.close = candle.close
      existing.volume += candle.volume
      existing.quoteVolume += candle.quoteVolume
      existing.trades += candle.trades
      existing.closed = candle.closed
    }
  }
  return [...buckets.values()].sort((a, b) => a.time - b.time)
}

export async function getCandles(timeframe: Timeframe, limit = 400): Promise<VenuePayload<Candle[]>> {
  // Binance uses lowercase intervals; OKX needs 1H/2H/4H in uppercase.
  const binanceInterval = timeframe === '3h' ? '1h' : timeframe
  const okxBar = timeframe === '1h' || timeframe === '3h' ? '1H' : timeframe
  // 3h is aggregated from 1h bars, so ask for three times as much source history.
  const sourceLimit = timeframe === '3h' ? Math.min(1500, limit * 3 + 60) : limit

  const payload = await attempt(
    async (): Promise<Candle[]> => {
      const rows = await binance<BinanceKline[]>(
        `/fapi/v1/klines?symbol=${SYMBOL}&interval=${binanceInterval}&limit=${Math.min(sourceLimit, 1500)}`,
      )
      return rows.map(row => ({
        time: row[0],
        open: num(row[1]),
        high: num(row[2]),
        low: num(row[3]),
        close: num(row[4]),
        volume: num(row[5]),
        quoteVolume: num(row[7]),
        trades: num(row[8]),
        closed: row[6] < Date.now(),
      }))
    },
    async (): Promise<Candle[]> => fetchOkxCandles(okxBar, sourceLimit),
  )

  if (timeframe !== '3h') return payload

  const now = Date.now()
  const aggregated = resample(payload.data, '3h').map(candle => ({
    ...candle,
    closed: candle.time + TF_MS['3h'] <= now,
  }))
  return { data: aggregated.slice(-limit), venue: payload.venue }
}

/**
 * OKX caps a single request at 300 candles, so walk backwards with the history endpoint
 * until enough bars are collected. Needed for warm-up on slow timeframes.
 */
async function fetchOkxCandles(bar: string, limit: number): Promise<Candle[]> {
  const collected = new Map<number, Candle>()
  let after: number | undefined

  for (let page = 0; page < 6 && collected.size < limit; page++) {
    const path = page === 0
      ? `market/candles?instId=${OKX_INSTRUMENT}&bar=${bar}&limit=300`
      : `market/history-candles?instId=${OKX_INSTRUMENT}&bar=${bar}&limit=300&after=${after}`
    const rows = await okx<string[][]>(path)
    if (!rows.length) break
    for (const row of rows) {
      const time = num(row[0])
      if (collected.has(time)) continue
      collected.set(time, {
        time,
        open: num(row[1]),
        high: num(row[2]),
        low: num(row[3]),
        close: num(row[4]),
        volume: num(row[6]),
        quoteVolume: num(row[7]),
        trades: 0,
        closed: row[8] === '1',
      })
    }
    after = Math.min(...rows.map(row => num(row[0])))
  }

  return [...collected.values()].sort((a, b) => a.time - b.time)
}

/* ------------------------------------------------------------------ */
/* Source benchmark                                                    */
/* ------------------------------------------------------------------ */

export type SourceDefinition = {
  name: string
  symbol: string
  role: 'primary' | 'fallback' | 'reference'
  url: string
  pick: (payload: unknown) => number
}

export const SOURCE_DEFINITIONS: SourceDefinition[] = [
  {
    name: 'Binance USDⓈ-M REST',
    symbol: 'XAUUSDT',
    role: 'reference',
    url: 'https://fapi.binance.com/fapi/v1/ticker/price?symbol=XAUUSDT',
    pick: payload => num((payload as { price?: string }).price),
  },
  {
    name: 'OKX SWAP',
    symbol: OKX_INSTRUMENT,
    role: 'fallback',
    url: `https://www.okx.com/api/v5/market/ticker?instId=${OKX_INSTRUMENT}`,
    pick: payload => num((payload as { data?: { last?: string }[] }).data?.[0]?.last),
  },
  {
    name: 'Gate.io USDT-M',
    symbol: 'XAU_USDT',
    role: 'reference',
    url: 'https://api.gateio.ws/api/v4/futures/usdt/tickers?contract=XAU_USDT',
    pick: payload => num((payload as { last?: string }[])[0]?.last),
  },
  {
    name: 'MEXC Contract',
    symbol: 'XAU_USDT',
    role: 'reference',
    url: 'https://contract.mexc.com/api/v1/contract/ticker?symbol=XAU_USDT',
    pick: payload => num((payload as { data?: { lastPrice?: number } }).data?.lastPrice),
  },
]

/**
 * Binance serves its futures WebSocket from a different edge than the REST host, so in some
 * regions the socket is reachable while REST returns 451. Probing it separately lets the
 * sources panel report which transport is actually live instead of only which REST host answers.
 */
export async function probeBinanceSocket() {
  const url = `wss://fstream.binance.com/ws/${SYMBOL.toLowerCase()}@bookTicker`
  const samples: number[] = []
  let last: number | null = null

  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const start = performance.now()
      const frame = await new Promise<unknown>((resolve, reject) => {
        const socket = new WebSocket(url)
        const timer = setTimeout(() => {
          socket.close()
          reject(new Error('Timed out after 5s'))
        }, 5_000)
        socket.onmessage = event => {
          clearTimeout(timer)
          try {
            resolve(JSON.parse(String(event.data)))
          } catch {
            reject(new Error('Malformed frame'))
          }
          socket.close()
        }
        socket.onerror = () => {
          clearTimeout(timer)
          reject(new Error('Socket blocked from this region'))
        }
      })
      const price = num((frame as { b?: string }).b)
      if (!(price > 0)) throw new Error('Instrument not verified')
      samples.push(Math.round(performance.now() - start))
      last = price
    }
    const sorted = [...samples].sort((a, b) => a - b)
    return { available: true, status: 'Verified live stream', latency: sorted[0] ?? null, last, samples }
  } catch (error) {
    return {
      available: false,
      status: error instanceof Error ? error.message : 'Unavailable',
      latency: null,
      last: null,
      samples,
    }
  }
}

export async function probeSource(definition: SourceDefinition) {
  const samples: number[] = []
  let last: number | null = null
  let status = 'Unreachable'
  try {
    for (let i = 0; i < 3; i++) {
      const start = performance.now()
      const payload = await getJson<unknown>(definition.url, 4_000)
      const price = definition.pick(payload)
      if (!(price > 0)) throw new HttpError(0, 'Instrument not verified')
      samples.push(Math.round(performance.now() - start))
      last = price
    }
    const sorted = [...samples].sort((a, b) => a - b)
    status = 'Verified live price'
    return { samples, last, status, latency: sorted[1] ?? sorted[0], available: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unavailable'
    status = message.includes('451') || message.includes('403') ? 'Region restricted' : message
    return { samples, last, status, latency: null, available: false }
  }
}
