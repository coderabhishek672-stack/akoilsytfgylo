import { getCandles } from '@/lib/exchange'
import { TIMEFRAMES, type CandleResponse, type Timeframe } from '@/lib/market-types'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const requested = (params.get('tf') || params.get('timeframe') || '15m') as Timeframe
  const limit = Math.min(Math.max(Number(params.get('limit')) || 400, 50), 1000)

  if (!TIMEFRAMES.includes(requested)) {
    return Response.json({ error: `Unsupported timeframe "${requested}"` }, { status: 400 })
  }

  try {
    const result = await getCandles(requested, limit)
    const body: CandleResponse = {
      candles: result.data,
      timeframe: requested,
      venue: result.venue,
      receivedAt: Date.now(),
    }
    return Response.json(body, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Candle feed unavailable', timeframe: requested, candles: [] },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
