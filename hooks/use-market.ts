'use client'

/**
 * Live market hook.
 *
 * Transport order:
 *  1. Binance USDⓈ-M WebSocket (bookTicker + depth20 + aggTrade) for sub-second quotes.
 *  2. REST polling through /api/market as recovery, and as the primary path in regions where
 *     the Binance socket is unreachable. The REST route itself falls back to OKX when needed.
 *
 * Whichever source produced the newest timestamp wins, so the UI never shows a stale quote.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import {
  SYMBOL,
  type BookLevel,
  type Candle,
  type CandleResponse,
  type Derivatives,
  type Instrument,
  type MarketSnapshot,
  type OrderBook,
  type Timeframe,
  type Ticker,
  type Trade,
} from '@/lib/market-types'

const WS_BASE = 'wss://fstream.binance.com'
const WS_STREAMS = [`${SYMBOL.toLowerCase()}@bookTicker`, `${SYMBOL.toLowerCase()}@depth20@100ms`, `${SYMBOL.toLowerCase()}@aggTrade`]

export async function fetcher<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error((data as { error?: string } | null)?.error || `Request failed (${response.status})`)
  return data as T
}

type BinanceBookTicker = { e: 'bookTicker'; b: string; B: string; a: string; A: string; T?: number; E: number }
type BinanceDepth = { e: 'depthUpdate'; E: number; T?: number; b: [string, string][]; a: [string, string][] }
type BinanceAggTrade = { e: 'aggTrade'; a: number; p: string; q: string; T: number; m: boolean }

export type FeedStatus = 'connecting' | 'live' | 'recovering' | 'offline'

export function useMarket(timeframe: Timeframe) {
  const [now, setNow] = useState(() => Date.now())
  const [stream, setStream] = useState<{ ticker: Ticker | null; book: OrderBook | null; trades: Trade[] }>({ ticker: null, book: null, trades: [] })
  const [socketStatus, setSocketStatus] = useState<FeedStatus>('connecting')
  const [latency, setLatency] = useState<number | null>(null)
  const [retryKey, setRetryKey] = useState(0)
  const tradeBuffer = useRef<Trade[]>([])

  const snapshot = useSWR<MarketSnapshot>('/api/market', fetcher, {
    refreshInterval: socketStatus === 'live' ? 15_000 : 2_500,
    dedupingInterval: 1_000,
    errorRetryInterval: 4_000,
  })
  const instrument = useSWR<Instrument>('/api/market/instrument', fetcher, { refreshInterval: 300_000, dedupingInterval: 60_000 })
  const candlesRequest = useSWR<CandleResponse>(`/api/market/candles?tf=${timeframe}`, fetcher, { refreshInterval: 15_000, dedupingInterval: 3_000 })

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(timer)
  }, [])

  // Binance futures WebSocket with exponential backoff and a watchdog.
  useEffect(() => {
    let stopped = false
    let socket: WebSocket | null = null
    let retry: ReturnType<typeof setTimeout> | undefined
    let failures = 0
    let lastMessage = Date.now()
    let buffer: { ticker?: Ticker; book?: OrderBook } = {}

    const connect = () => {
      if (stopped) return
      setSocketStatus(previous => (previous === 'live' ? 'recovering' : 'connecting'))
      try {
        socket = new WebSocket(`${WS_BASE}/stream?streams=${WS_STREAMS.join('/')}`)
      } catch {
        retry = setTimeout(connect, 5_000)
        return
      }

      socket.onopen = () => {
        failures = 0
        lastMessage = Date.now()
        setSocketStatus('live')
      }

      socket.onmessage = event => {
        lastMessage = Date.now()
        let message: { stream?: string; data?: unknown }
        try {
          message = JSON.parse(event.data as string)
        } catch {
          return
        }
        const payload = message.data
        if (!payload || typeof payload !== 'object') return
        const kind = (payload as { e?: string }).e

        if (kind === 'bookTicker') {
          const data = payload as BinanceBookTicker
          const bid = Number(data.b)
          const ask = Number(data.a)
          if (!(bid > 0) || !(ask > 0) || ask < bid) return
          const ts = data.T || data.E || Date.now()
          buffer.ticker = {
            symbol: SYMBOL,
            venue: 'BINANCE',
            last: (bid + ask) / 2,
            bid,
            ask,
            bidSize: Number(data.B) || 0,
            askSize: Number(data.A) || 0,
            open24h: 0,
            high24h: 0,
            low24h: 0,
            volume24h: 0,
            quoteVolume24h: 0,
            changePct24h: 0,
            ts,
          }
          setLatency(Math.max(0, Date.now() - ts))
        } else if (kind === 'depthUpdate') {
          const data = payload as BinanceDepth
          const bids: BookLevel[] = data.b.map(([price, size]) => ({ price: Number(price), size: Number(size) })).filter(level => level.price > 0)
          const asks: BookLevel[] = data.a.map(([price, size]) => ({ price: Number(price), size: Number(size) })).filter(level => level.price > 0)
          if (!bids.length || !asks.length) return
          buffer.book = { bids, asks, ts: data.T || data.E || Date.now(), venue: 'BINANCE' }
        } else if (kind === 'aggTrade') {
          const data = payload as BinanceAggTrade
          const price = Number(data.p)
          const size = Number(data.q)
          if (!(price > 0) || !(size > 0)) return
          tradeBuffer.current.unshift({ id: String(data.a), price, size, side: data.m ? 'SELL' : 'BUY', ts: data.T })
          if (tradeBuffer.current.length > 60) tradeBuffer.current.length = 60
        }
      }

      socket.onerror = () => socket?.close()
      socket.onclose = () => {
        if (stopped) return
        setSocketStatus('recovering')
        retry = setTimeout(connect, Math.min(20_000, 1_000 * 2 ** failures++))
      }
    }

    connect()
    const flush = setInterval(() => {
      if (!buffer.ticker && !buffer.book && !tradeBuffer.current.length) return
      const next = buffer
      buffer = {}
      const trades = tradeBuffer.current
      tradeBuffer.current = []
      setStream(previous => ({
        ticker: next.ticker ?? previous.ticker,
        book: next.book ?? previous.book,
        trades: trades.length ? [...trades, ...previous.trades].slice(0, 60) : previous.trades,
      }))
    }, 150)

    const watchdog = setInterval(() => {
      if (Date.now() - lastMessage > 25_000) {
        setSocketStatus('recovering')
        socket?.close()
      }
    }, 10_000)

    return () => {
      stopped = true
      clearTimeout(retry)
      clearInterval(flush)
      clearInterval(watchdog)
      socket?.close()
    }
  }, [retryKey])

  // REST trade tape tops up the socket tape (and is the only tape when the socket is blocked).
  useEffect(() => {
    if (socketStatus === 'live') return
    if (!snapshot.data?.trades?.length) return
    setStream(previous => (previous.trades.length ? previous : { ...previous, trades: snapshot.data!.trades }))
  }, [snapshot.data, socketStatus])

  const candlesRaw = (candlesRequest.data?.candles ?? []) as Candle[]
  const restTicker = snapshot.data?.ticker ?? null
  const restBook = snapshot.data?.book ?? null
  const derivatives: Derivatives | null = snapshot.data?.derivatives ?? null

  // Prefer whichever quote is newest; enrich the socket quote with the REST 24h statistics.
  const ticker = useMemo<Ticker | null>(() => {
    const live = stream.ticker
    if (live && restTicker && restTicker.ts > live.ts) return { ...live, ...restTicker }
    if (live && restTicker) {
      return {
        ...live,
        open24h: restTicker.open24h,
        high24h: restTicker.high24h,
        low24h: restTicker.low24h,
        volume24h: restTicker.volume24h,
        quoteVolume24h: restTicker.quoteVolume24h,
        changePct24h: restTicker.changePct24h,
      }
    }
    return live ?? restTicker
  }, [stream.ticker, restTicker])

  const book = useMemo<OrderBook | null>(() => {
    if (stream.book && restBook) return stream.book.ts >= restBook.ts ? stream.book : restBook
    return stream.book ?? restBook
  }, [stream.book, restBook])

  const trades = stream.trades.length ? stream.trades : (snapshot.data?.trades ?? [])

  /**
   * Fold the live quote into the forming candle so the chart's right edge tracks the tape
   * instead of jumping only when the next REST candle poll lands. Closed candles are untouched.
   */
  const candles = useMemo<Candle[]>(() => {
    const source = candlesRaw
    if (!source.length || !ticker?.last) return source
    const last = source[source.length - 1]
    if (last.closed) return source
    const price = ticker.last
    const merged: Candle = {
      ...last,
      close: price,
      high: Math.max(last.high, price),
      low: Math.min(last.low, price),
    }
    return [...source.slice(0, -1), merged]
  }, [candlesRaw, ticker?.last])

  const quoteAge = now && ticker ? Math.max(0, now - ticker.ts) : null
  const bookAge = now && book ? Math.max(0, now - book.ts) : null
  const venue = book?.venue ?? ticker?.venue ?? snapshot.data?.venue ?? 'BINANCE'
  const verified = !!instrument.data && instrument.data.state === 'live'
  const fresh = verified && quoteAge !== null && quoteAge < 12_000 && bookAge !== null && bookAge < 12_000 && !!ticker && ticker.last > 0
  const feedStatus: FeedStatus = fresh ? (socketStatus === 'live' ? 'live' : 'recovering') : snapshot.isLoading ? 'connecting' : 'offline'

  const spread = book && book.asks[0] && book.bids[0] ? book.asks[0].price - book.bids[0].price : null
  const midPrice = book && book.asks[0] && book.bids[0] ? (book.asks[0].price + book.bids[0].price) / 2 : null

  const refresh = useCallback(() => {
    void snapshot.mutate()
    void instrument.mutate()
    void candlesRequest.mutate()
    setRetryKey(key => key + 1)
  }, [snapshot, instrument, candlesRequest])

  const candlesError = candlesRequest.error?.message ?? candlesRequest.data?.error ?? null

  return {
    now,
    timeframe,
    ticker,
    book,
    trades,
    derivatives,
    instrument: instrument.data ?? null,
    candles,
    candlesReceivedAt: candlesRequest.data?.receivedAt ?? null,
    venue,
    candleVenue: candlesRequest.data?.venue ?? null,
    feedStatus,
    socketStatus,
    latency,
    quoteAge,
    bookAge,
    spread,
    midPrice,
    fresh,
    verified,
    snapshotLatency: snapshot.data?.latency ?? null,
    loading: snapshot.isLoading || candlesRequest.isLoading,
    error: candlesError ?? snapshot.error?.message ?? instrument.error?.message ?? null,
    warnings: snapshot.data?.errors ?? [],
    refresh,
  }
}

export type MarketState = ReturnType<typeof useMarket>
