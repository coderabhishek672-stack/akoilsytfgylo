import { getCandles, getInstrument, type VenuePayload } from '@/lib/exchange'
import { analyzeTimeframe, buildTimeline, consensusOf, createConfluenceLookup } from '@/lib/signal-engine'
import { TIMEFRAMES, SYMBOL, type Candle, type SignalSnapshot, type Timeframe, type TimeframeAnalysis } from '@/lib/market-types'

export const dynamic = 'force-dynamic'

/**
 * Computes the full multi-timeframe signal picture on the server so the browser only renders it.
 *
 * 1. Every timeframe's candles are fetched once and reused for the timeline and the replay.
 * 2. Each timeframe becomes an indexed indicator timeline.
 * 3. The timelines are combined into a lookup so a lock taken at any past close is evaluated
 *    against what the *other* timeframes actually looked like at that same moment.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const activeTimeframe = (params.get('tf') || '5m') as Timeframe
  const now = Date.now()

  const [instrumentResult, ...candleResults] = await Promise.all([
    getInstrument().catch(() => null as VenuePayload<never> | null),
    ...TIMEFRAMES.map(timeframe => getCandles(timeframe, 400).catch(() => null as VenuePayload<Candle[]> | null)),
  ])

  const tick = instrumentResult?.data.tickSize ?? 0.01
  const candleMap = new Map<Timeframe, VenuePayload<Candle[]>>()
  TIMEFRAMES.forEach((timeframe, index) => {
    const result = candleResults[index]
    if (result) candleMap.set(timeframe, result)
  })
  const venue = candleMap.values().next().value?.venue ?? instrumentResult?.venue ?? 'BINANCE'

  if (candleMap.size === 0) {
    const body: SignalSnapshot = {
      symbol: SYMBOL,
      venue,
      price: 0,
      analyses: [],
      activeTimeframe,
      lock: null,
      consensus: { bias: 'NEUTRAL', score: 0, bullish: 0, bearish: 0, neutral: 0, alignment: 0 },
      receivedAt: now,
      error: 'No candle feed is reachable right now. Signals are blocked until verified data returns.',
    }
    return Response.json(body, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }

  const timelines = TIMEFRAMES.map(timeframe => buildTimeline(candleMap.get(timeframe)?.data ?? [], timeframe))
  const lookup = createConfluenceLookup(timelines)

  const analyses: TimeframeAnalysis[] = TIMEFRAMES.map(timeframe =>
    analyzeTimeframe(candleMap.get(timeframe)?.data ?? [], timeframe, tick, now, lookup),
  )

  const active = analyses.find(analysis => analysis.timeframe === activeTimeframe)
  const price =
    active?.indicators?.price ??
    analyses.find(analysis => analysis.indicators)?.indicators?.price ??
    0

  const body: SignalSnapshot = {
    symbol: SYMBOL,
    venue,
    price,
    analyses,
    activeTimeframe,
    lock: active?.lock ?? null,
    consensus: consensusOf(analyses),
    receivedAt: now,
    error: active?.error ?? null,
  }

  return Response.json(body, { headers: { 'Cache-Control': 'no-store' } })
}
