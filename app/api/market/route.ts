import { getBook, getDerivatives, getTicker, getTrades } from '@/lib/exchange'
import { SYMBOL, type MarketSnapshot } from '@/lib/market-types'

export const dynamic = 'force-dynamic'

/** One batched REST poll used to seed the terminal before the WebSocket takes over. */
export async function GET() {
  const start = performance.now()
  const [ticker, book, derivatives, trades] = await Promise.allSettled([
    getTicker(),
    getBook(20),
    getDerivatives(),
    getTrades(40),
  ])

  const venue =
    ticker.status === 'fulfilled'
      ? ticker.value.venue
      : book.status === 'fulfilled'
        ? book.value.venue
        : 'BINANCE'

  const errors: string[] = []
  const label = ['Ticker', 'Order book', 'Derivatives', 'Trades']
  ;[ticker, book, derivatives, trades].forEach((result, index) => {
    if (result.status === 'rejected') {
      errors.push(`${label[index]}: ${result.reason instanceof Error ? result.reason.message : 'Unavailable'}`)
    }
  })

  const body: MarketSnapshot = {
    ticker: ticker.status === 'fulfilled' ? ticker.value.data : null,
    book: book.status === 'fulfilled' ? book.value.data : null,
    derivatives: derivatives.status === 'fulfilled' ? derivatives.value.data : null,
    trades: trades.status === 'fulfilled' ? trades.value.data : [],
    venue,
    receivedAt: Date.now(),
    latency: Math.round(performance.now() - start),
    errors,
  }

  return Response.json(body, { headers: { 'Cache-Control': 'no-store' } })
}
