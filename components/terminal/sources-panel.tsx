'use client'

import useSWR from 'swr'
import { CircleHelp, Database, ExternalLink, Gauge, LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-react'
import { fetcher, type MarketState } from '@/hooks/use-market'
import type { SourceProbe } from '@/lib/market-types'
import { formatPrice } from '@/lib/market-types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Panel, DataRow, StatusDot } from './panel'
import { cn } from '@/lib/utils'

type SourcesResponse = { sources: SourceProbe[]; testedAt: number; note: string }

export function SourcesPanel({ market }: { market: MarketState }) {
  const { data, error, isValidating, mutate } = useSWR<SourcesResponse>('/api/market/sources', fetcher, {
    dedupingInterval: 60_000,
    revalidateOnFocus: false,
    errorRetryCount: 1,
  })
  const fastest = data?.sources.filter(source => source.available).sort((a, b) => (a.latency ?? 0) - (b.latency ?? 0))[0]?.name

  return (
    <div className="flex flex-col gap-4">
      <div className="mb-2">
        <div className="eyebrow">DATA PROVENANCE</div>
        <h2 className="mt-2 text-2xl font-medium tracking-tight">Real markets. Verifiable sources.</h2>
        <p className="mt-2 max-w-3xl text-xs leading-relaxed text-muted-foreground">
          Every market number is fetched live from the venue, and latency is measured from this deployment rather than
          assumed. Binance USDⓈ-M XAUUSDT is the primary feed. Because the Binance REST host returns HTTP 451 from some
          hosting regions, candle history automatically falls back to the OKX XAU-USDT perpetual while quotes, depth and
          the tape continue to stream from Binance. No tokenised-gold substitutes and no simulated prices.
        </p>
      </div>

      <Panel
        title="Live feed provenance"
        icon={<ShieldCheck className="size-3.5" />}
      >
        <div className="grid gap-3 p-5 sm:grid-cols-3">
          {[
            {
              label: 'Quotes · order book · tape',
              value: market.socketStatus === 'live' ? 'Binance futures WebSocket' : 'Binance WebSocket (reconnecting)',
              detail: 'bookTicker · depth20 · aggTrade',
              live: market.socketStatus === 'live',
            },
            {
              label: 'Candle history & indicators',
              value: market.candleVenue ?? market.venue,
              detail: market.candleVenue === 'BINANCE' ? 'Binance klines' : 'OKX candles, resampled to the selected timeframe',
              live: market.fresh,
            },
            {
              label: 'Venue reference price',
              value: 'Binance mark price',
              detail: 'Cross-checked against the live quote on every poll',
              live: market.derivatives !== null,
            },
          ].map(item => (
            <div key={item.label} className="rounded-md border border-border bg-background/40 p-3">
              <div className="flex items-center gap-1.5 text-[9px] tracking-wider text-muted-foreground uppercase">
                <StatusDot live={item.live} />
                {item.label}
              </div>
              <div className="mt-2 font-mono text-[11px] text-foreground">{item.value}</div>
              <div className="mt-1 text-[9px] text-muted-foreground">{item.detail}</div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        title="Exchange connectivity benchmark"
        icon={<Gauge className="size-3.5" />}
        action={
          <Button variant="outline" size="xs" onClick={() => void mutate()} disabled={isValidating} className="text-[10px]">
            <RefreshCw className={cn('size-3!', isValidating && 'animate-spin')} />
            Retest sources
          </Button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-170 text-left text-xs">
            <thead>
              <tr className="border-b border-border text-[10px] text-muted-foreground">
                {['Exchange', 'Instrument', 'Availability', 'Median REST RTT', 'Last price', 'Role'].map(header => (
                  <th key={header} className="px-5 py-3 font-normal">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.sources.map(source => (
                <tr key={source.name} className="border-b border-border last:border-0">
                  <td className="px-5 py-4 font-medium">{source.name}</td>
                  <td className="px-5 py-4 font-mono text-[11px]">{source.symbol}</td>
                  <td className={cn('px-5 py-4 text-[11px]', source.available ? 'text-positive' : 'text-primary')}>{source.status}</td>
                  <td className="px-5 py-4 font-mono">
                    {source.latency === null ? '—' : `${source.latency} ms`}
                    {fastest === source.name && <span className="ml-2 text-[9px] text-positive">FASTEST</span>}
                  </td>
                  <td className="px-5 py-4 font-mono">{source.last === null ? '—' : formatPrice(source.last, 2)}</td>
                  <td className="px-5 py-4">
                    {source.role === 'socket' ? (
                      <Badge variant="outline" className="rounded border-positive/30 text-[9px] text-positive">LIVE QUOTES + DEPTH</Badge>
                    ) : source.role === 'primary' ? (
                      <Badge variant="outline" className="rounded border-primary/30 text-[9px] text-primary">PRIMARY FEED</Badge>
                    ) : source.role === 'fallback' ? (
                      <Badge variant="outline" className="rounded border-border text-[9px] text-muted-foreground">AUTO FALLBACK</Badge>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">Cross-check only</span>
                    )}
                  </td>
                </tr>
              ))}
              {!data && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    {error ? (
                      'Benchmark unavailable. Retest to run a new probe.'
                    ) : (
                      <span className="inline-flex items-center gap-2"><LoaderCircle className="size-4 animate-spin" />Testing exact XAU contracts…</span>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border px-5 py-3 text-[10px] leading-relaxed text-muted-foreground">
          {data?.note || 'Three real requests per venue. Region restrictions are respected, not bypassed.'}
          {data && <div className="mt-1 font-mono">Measured {new Date(data.testedAt).toISOString().replace('T', ' ').slice(0, 19)} UTC</div>}
        </div>
      </Panel>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Live feed health" icon={<Database className="size-3.5" />}>
          <div className="divide-y divide-border px-5 py-1">
            <DataRow label="Active venue">{market.venue}</DataRow>
            <DataRow label="Transport">
              {market.socketStatus === 'live' ? 'Binance WebSocket stream' : market.socketStatus === 'recovering' ? 'Reconnecting · REST recovery' : 'REST recovery'}
            </DataRow>
            <DataRow label="Streams">
              {market.socketStatus === 'live' ? 'bookTicker · depth20 · aggTrade' : 'REST polling every 2.5s'}
            </DataRow>
            <DataRow label="Candle venue">{market.candleVenue ?? '—'}</DataRow>
            <DataRow label="Quote age">{market.quoteAge === null ? '—' : `${market.quoteAge} ms`}</DataRow>
            <DataRow label="Book age">{market.bookAge === null ? '—' : `${market.bookAge} ms`}</DataRow>
            <DataRow label="Socket latency">{market.latency === null ? '—' : `${market.latency} ms`}</DataRow>
            <DataRow label="REST batch time">{market.snapshotLatency === null ? '—' : `${market.snapshotLatency} ms`}</DataRow>
            <DataRow label="Instrument state">{market.instrument ? `${market.instrument.symbol} · ${market.instrument.state}` : 'Not verified'}</DataRow>
          </div>
        </Panel>

        <Panel title="Source & research notes" icon={<CircleHelp className="size-3.5" />}>
          <div className="space-y-3 p-5 text-xs leading-relaxed text-muted-foreground">
            <p>
              Binance publishes the USDⓈ-M bookTicker stream on every best-bid/best-ask change and the depth stream every 100 ms
              when the book changes. Rendering is batched to 150 ms so the browser is never overwhelmed.
            </p>
            <p>
              When the Binance REST host returns HTTP 451 from a restricted region, the server automatically walks its mirror list
              and then falls back to OKX. Both are real gold perpetuals and track the same underlying, but the venue label changes
              so a difference between them is never hidden.
            </p>
            <p>
              Candle continuity, tick size and feed freshness are validated before any signal is allowed. If the data is stale or
              discontinuous, the lock is withheld instead of guessed.
            </p>
            <a className="inline-flex items-center gap-1 text-primary hover:underline" href="https://developers.binance.com/docs/derivatives/usds-margined-futures/websocket-market-streams" target="_blank" rel="noreferrer">
              Read the official Binance futures stream documentation<ExternalLink className="size-3" />
            </a>
          </div>
        </Panel>
      </div>

      <div className="flex items-start gap-2 rounded-md border border-primary/15 bg-primary/4 px-4 py-3 text-[10px] leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />
        <span>
          This terminal reads public market data only. It holds no API keys, places no orders and stores nothing about you.
        </span>
      </div>
    </div>
  )
}
