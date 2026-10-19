import { probeBinanceSocket, probeSource, SOURCE_DEFINITIONS } from '@/lib/exchange'
import { SYMBOL } from '@/lib/market-types'
import type { SourceProbe } from '@/lib/market-types'

export const dynamic = 'force-dynamic'

/**
 * Measures real round-trip latency to each venue from this deployment.
 * The Binance futures WebSocket is probed separately because it is served from a different
 * edge than the REST host and can be reachable even where REST is region-restricted.
 */
export async function GET() {
  const [socket, ...rest] = await Promise.all([
    probeBinanceSocket(),
    ...SOURCE_DEFINITIONS.map(async (definition): Promise<SourceProbe> => {
      const probe = await probeSource(definition)
      return {
        name: definition.name,
        symbol: definition.symbol,
        role: definition.role,
        available: probe.available,
        latency: probe.latency,
        status: probe.status,
        samples: probe.samples,
        last: probe.last,
      }
    }),
  ])

  const sources: SourceProbe[] = [
    {
      name: 'Binance USDⓈ-M WebSocket',
      symbol: SYMBOL,
      role: 'socket',
      available: socket.available,
      latency: socket.latency,
      status: socket.status,
      samples: socket.samples,
      last: socket.last,
    },
    ...rest,
  ]

  const liveSocket = socket.available
  const liveRest = rest.find(source => source.available)

  return Response.json(
    {
      sources,
      testedAt: Date.now(),
      note: liveSocket
        ? `Median of 3 live REST round trips plus a real WebSocket handshake, measured from this deployment. Binance REST is region-restricted here, but the Binance futures WebSocket answers, so ${SYMBOL} quotes, depth and the trade tape stream directly from Binance and only the candle history is served by ${liveRest?.name ?? 'a fallback venue'}.`
        : `Median of 3 live REST round trips from this deployment. Availability is jurisdiction dependent. Binance USDⓈ-M ${SYMBOL} is the primary feed; OKX XAU-USDT-SWAP is the automatic fallback.`,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
