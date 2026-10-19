'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  ChartNoAxesCombined,
  ChevronRight,
  CircleHelp,
  Crosshair,
  Database,
  Gem,
  LayoutDashboard,
  LockKeyhole,
  Radio,
  RefreshCw,
  Scale,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useMarket } from '@/hooks/use-market'
import { useSignals } from '@/hooks/use-signals'
import { TF_LABEL, compact, formatCountdown, formatPrice, type Timeframe } from '@/lib/market-types'
import { cn } from '@/lib/utils'
import { StatusDot } from './panel'
import { ConfluenceLadder, ConsensusStrip, SignalLockPanel, TimeframeSwitch } from './signal-lock'
import { DerivativesPanel, IndicatorPanel, OrderBookPanel, RiskSizer, SignalHistory, TradeTape } from './market-panels'
import { MethodologyDialog } from './methodology-dialog'

const PriceChart = dynamic(() => import('./price-chart').then(module => module.PriceChart), {
  ssr: false,
  loading: () => (
    <div className="terminal-panel min-h-132">
      <div className="panel-heading">PRICE ACTION</div>
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">Loading chart engine…</div>
    </div>
  ),
})
const SourcesPanel = dynamic(() => import('./sources-panel').then(module => module.SourcesPanel), {
  loading: () => <div className="p-8 text-sm text-muted-foreground">Loading market provenance…</div>,
})

type View = 'terminal' | 'signals' | 'sources' | 'risk'
const VIEWS = [
  { id: 'terminal', label: 'Terminal', icon: LayoutDashboard },
  { id: 'signals', label: 'Signal lock', icon: Crosshair },
  { id: 'sources', label: 'Market data', icon: Database },
  { id: 'risk', label: 'Risk calculator', icon: Scale },
] as const

export function Terminal() {
  const [timeframe, setTimeframe] = useState<Timeframe>('5m')
  const [view, setView] = useState<View>('terminal')
  const [methodology, setMethodology] = useState(false)

  const market = useMarket(timeframe)
  const signals = useSignals(timeframe, market)

  const { ticker, now } = market
  const decimals = (market.instrument?.tickSize ?? 0.01) < 1 ? 2 : 1
  const change = ticker && ticker.open24h > 0 ? (ticker.last / ticker.open24h - 1) * 100 : null
  const positive = (change ?? 0) >= 0
  const lock = signals.lock
  const countdownMs = now ? signals.tfMs - (now % signals.tfMs) : null
  const down = !market.loading && !market.fresh

  const signalAge = useMemo(() => {
    if (!lock?.lockedAt || !now) return null
    return now - lock.lockedAt
  }, [lock?.lockedAt, now])

  return (
    <div className="terminal-app">
      <a href="#workspace" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-20 focus:z-50 focus:rounded focus:bg-primary focus:p-3 focus:text-primary-foreground">
        Skip to terminal workspace
      </a>

      <header className="app-header">
        <a href="/" className="flex shrink-0 items-center gap-3" aria-label="XAU scalping terminal home">
          <span className="brand-mark"><Gem className="size-5" strokeWidth={1.5} /></span>
          <span>
            <span className="block text-[14px] font-semibold tracking-[0.18em]">AURUM<span className="text-primary">.</span></span>
            <span className="mt-1 block text-[8px] tracking-[0.22em] text-muted-foreground">XAU/USDT SCALPING TERMINAL</span>
          </span>
        </a>
        <span className="ml-5 hidden h-6 border-l border-border lg:block" />
        <div className="ml-5 hidden items-center gap-2 lg:flex">
          <span className="text-[10px] text-muted-foreground">TIMEFRAME</span>
          <ChevronRight className="size-3 text-muted-foreground" />
          <span className="font-mono text-[10px] text-primary">{timeframe.toUpperCase()}</span>
          <span className="text-[10px] text-muted-foreground">· {TF_LABEL[timeframe]}</span>
        </div>
        <div className="ml-auto flex items-center gap-3 sm:gap-5">
          <Badge variant="outline" className="hidden h-6 gap-1.5 rounded border-border bg-positive/4 text-[9px] font-normal text-positive sm:inline-flex">
            <ShieldCheck className="size-3" />REAL DATA ONLY
          </Badge>
          <div className="hidden text-right font-mono md:block">
            <div className="text-[11px] text-foreground">
              {now ? new Date(now).toISOString().slice(11, 19) : '--:--:--'} <span className="text-muted-foreground">UTC</span>
            </div>
            <div className="mt-1 text-[8px] text-muted-foreground">
              {now ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(now).toUpperCase() : 'SYNCING EXCHANGE'}
            </div>
          </div>
          <Button size="icon-sm" variant="ghost" aria-label="Refresh all feeds" title="Refresh all feeds" onClick={() => { market.refresh(); signals.refresh() }} className="text-muted-foreground">
            <RefreshCw className={cn('size-3.5!', (market.loading || signals.isValidating) && 'animate-spin')} />
          </Button>
          <span className="hidden h-5 border-l border-border sm:block" />
          <span className="flex size-7 items-center justify-center rounded-md border border-primary/20 bg-primary/8 font-mono text-[10px] text-primary">XAU</span>
        </div>
      </header>

      <div className="app-body">
        <aside className="icon-rail" aria-label="Workspace navigation">
          <div className="flex flex-col gap-3">
            {VIEWS.map(item => (
              <Button
                key={item.id}
                variant="ghost"
                size="icon"
                onClick={() => setView(item.id)}
                aria-label={item.label}
                title={item.label}
                aria-current={view === item.id ? 'page' : undefined}
                className={cn('size-9 rounded-md', view === item.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground')}
              >
                <item.icon className="size-4!" />
              </Button>
            ))}
          </div>
          <div className="mt-auto flex flex-col gap-4">
            <span className="mx-auto h-8 border-l border-border" />
            <Button variant="ghost" size="icon" onClick={() => setMethodology(true)} aria-label="Read methodology and risk disclosures" className="text-muted-foreground">
              <CircleHelp className="size-4!" />
            </Button>
            <span className="mx-auto mb-1 size-1.5 rounded-full bg-primary/70" />
          </div>
        </aside>

        <div className="workspace-shell">
          <nav className="workspace-nav" aria-label="Terminal sections">
            <div className="flex min-w-0 items-stretch gap-5 overflow-x-auto sm:gap-7">
              {VIEWS.map(item => (
                <button
                  key={item.id}
                  onClick={() => setView(item.id)}
                  aria-current={view === item.id ? 'page' : undefined}
                  className={cn('workspace-tab', view === item.id && 'active')}
                >
                  <item.icon className="size-3" />
                  {item.label}
                  {item.id === 'terminal' && <span className="ml-1 hidden rounded bg-primary/12 px-1.5 py-0.5 font-mono text-[8px] text-primary sm:inline">LIVE</span>}
                </button>
              ))}
            </div>
            <div className="ml-auto hidden shrink-0 items-center gap-2 pl-4 text-[9px] text-muted-foreground lg:flex">
              <LockKeyhole className="size-3 text-primary" />
              Signal Lock · frozen levels
              <Badge variant="outline" className="ml-2 h-4 rounded border-border px-1 text-[8px] text-muted-foreground">v2.0</Badge>
            </div>
          </nav>

          <main id="workspace" className="workspace-content">
            <div className="instrument-strip">
              <div className="flex shrink-0 items-center gap-3">
                <span className="gold-coin">
                  <span className="text-[19px] leading-none font-semibold">Au</span>
                  <span className="mt-1 text-[7px] tracking-[0.15em]">GOLD</span>
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-lg font-semibold tracking-tight">XAU<span className="font-normal text-muted-foreground"> / </span>USDT</h1>
                    <span className="rounded border border-border px-1.5 py-0.5 text-[8px] text-muted-foreground">PERP</span>
                    <span className={cn('rounded border px-1.5 py-0.5 font-mono text-[8px]', market.venue === 'BINANCE' ? 'border-primary/25 text-primary' : 'border-border text-muted-foreground')}>
                      {market.venue}
                    </span>
                    {market.candleVenue && market.candleVenue !== market.venue && (
                      <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[8px] text-muted-foreground" title="Candle and signal history venue">
                        CHART {market.candleVenue}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-[9px] text-muted-foreground">
                    <span className="grid grid-cols-2 gap-0.5" aria-hidden="true">
                      {[0, 1, 2, 3].map(index => <span key={index} className="size-1 bg-foreground/70" />)}
                    </span>
                    {market.venue === 'BINANCE' ? 'Binance USDⓈ-M' : 'OKX XAU-USDT swap'} · 1 troy ounce · USDT margined
                  </div>
                </div>
              </div>
              <div className="price-block">
                <div className="font-mono text-[30px] leading-none font-medium tracking-[-0.05em]">{formatPrice(market.midPrice ?? ticker?.last, decimals)}</div>
                <div className={cn('mt-2 flex items-center gap-1 text-[10px]', positive ? 'text-positive' : 'text-negative')}>
                  {change !== null && (positive ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />)}
                  <span className="font-mono">{change === null ? '—' : `${positive ? '+' : ''}${change.toFixed(2)}%`}</span>
                  <span className="ml-1 text-muted-foreground">24h change</span>
                </div>
              </div>
              <div className="ticker-stat"><span>24h high</span><b>{formatPrice(ticker?.high24h, decimals)}</b></div>
              <div className="ticker-stat"><span>24h low</span><b>{formatPrice(ticker?.low24h, decimals)}</b></div>
              <div className="ticker-stat"><span>24h volume <small>XAU</small></span><b>{compact(ticker?.volume24h)}</b></div>
              <div className="ticker-stat hidden xl:flex">
                <span>Best bid / ask</span>
                <b>{formatPrice(market.book?.bids[0]?.price, decimals)} <em>/</em> {formatPrice(market.book?.asks[0]?.price, decimals)}</b>
              </div>
              <div className="ticker-stat hidden 2xl:flex">
                <span>Spread</span>
                <b>{formatPrice(market.spread, decimals)}</b>
              </div>
              <div className="ml-auto shrink-0 text-right">
                <div className={cn('inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[9px]', market.fresh ? 'border-positive/20 bg-positive/5 text-positive' : 'border-primary/20 bg-primary/5 text-primary')}>
                  <StatusDot live={market.fresh} />
                  {market.fresh ? (market.socketStatus === 'live' ? 'LIVE STREAM' : 'LIVE · REST') : market.loading ? 'CONNECTING' : 'DELAYED'}
                </div>
                <div className="mt-2 font-mono text-[9px] text-muted-foreground">
                  {market.quoteAge === null ? 'Synchronizing' : `${(market.quoteAge / 1000).toFixed(1)}s quote age`}
                  {market.latency !== null && <span className="ml-2 text-foreground/70">{(market.latency).toFixed(0)} ms</span>}
                </div>
              </div>
            </div>

            <TimeframeSwitch analyses={signals.analyses} active={timeframe} onSelect={setTimeframe} signals={signals} market={market} />

            {down && (
              <Alert className="mt-4 border-primary/20 bg-primary/5 text-primary">
                <TriangleAlert />
                <AlertTitle className="text-xs">Market data is not currently actionable</AlertTitle>
                <AlertDescription className="text-[11px]">
                  {market.error || 'Awaiting fresh quotes, order book and instrument verification.'} Historical values may remain visible.
                  Locked levels are shown but no new lock will be taken until the feed is verified. No fallback asset is used.
                </AlertDescription>
              </Alert>
            )}

            {view === 'terminal' && (
              <>
                <div className="section-intro">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium">Scalping desk</span>
                    <span className="text-[9px] text-muted-foreground">/</span>
                    <span className="text-[10px] text-muted-foreground">
                      {lock ? `Locked ${lock.direction} on ${lock.timeframe.toUpperCase()} · grade ${lock.grade}` : 'No active lock — scanning all timeframes'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
                    <span className="hidden sm:inline">NEXT {timeframe.toUpperCase()} CLOSE</span>
                    <span className="font-mono text-primary">{countdownMs === null ? '—' : formatCountdown(countdownMs)}</span>
                    <span className="mx-1 h-3 border-l border-border" />
                    <Activity className="size-3 text-primary" />
                    <span>10-factor engine · 7 timeframes</span>
                  </div>
                </div>

                <ConsensusStrip signals={signals} />

                <div className="primary-grid">
                  <PriceChart
                    candles={market.candles}
                    timeframe={timeframe}
                    onTimeframeChange={setTimeframe}
                    lock={lock}
                    previewLevels={signals.analysis?.evaluation?.previewLevels ?? null}
                    live={market.fresh}
                    tick={market.instrument?.tickSize ?? 0.01}
                    venue={market.venue}
                    error={market.error}
                  />
                  <SignalLockPanel signals={signals} market={market} timeframe={timeframe} onMethodology={() => setMethodology(true)} />
                </div>

                <div className="secondary-grid">
                  <IndicatorPanel market={market} signals={signals} timeframe={timeframe} />
                  <OrderBookPanel market={market} signals={signals} />
                  <TradeTape market={market} />
                </div>

                <div className="secondary-grid secondary-grid-two">
                  <ConfluenceLadder signals={signals} timeframe={timeframe} />
                  <DerivativesPanel market={market} />
                </div>

                <SignalHistory signals={signals} />
              </>
            )}

            {view === 'signals' && (
              <>
                <div className="mt-5 mb-4">
                  <div className="eyebrow">SIGNAL LOCK · MULTI-TIMEFRAME</div>
                  <h2 className="mt-2 text-2xl font-medium tracking-tight">Frozen levels. Confirmed direction.</h2>
                  <p className="mt-2 max-w-3xl text-xs leading-relaxed text-muted-foreground">
                    Each timeframe keeps its own independent lock. Switch the engine above to inspect 1m, 3m, 5m, 15m, 30m, 1h or 3h.
                    A lock freezes entry, stop and targets until it is triggered, invalidated, completed or expired — live quotes never move a level.
                  </p>
                </div>
                <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
                  <div className="flex flex-col gap-4">
                    <ConfluenceLadder signals={signals} timeframe={timeframe} />
                    <IndicatorPanel market={market} signals={signals} timeframe={timeframe} />
                    <SignalHistory signals={signals} />
                  </div>
                  <SignalLockPanel signals={signals} market={market} timeframe={timeframe} onMethodology={() => setMethodology(true)} />
                </div>
              </>
            )}

            {view === 'sources' && <div className="mt-5"><SourcesPanel market={market} /></div>}

            {view === 'risk' && (
              <>
                <div className="mt-5 mb-4">
                  <div className="eyebrow">RISK BEFORE REWARD</div>
                  <h2 className="mt-2 text-2xl font-medium tracking-tight">Size the risk. Respect the market.</h2>
                  <p className="mt-2 max-w-3xl text-xs leading-relaxed text-muted-foreground">
                    A planning tool based on the locked stop distance and the live contract unit. Not a trading account and not order entry.
                  </p>
                </div>
                <RiskSizer market={market} signals={signals} />
                <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
                  <div className="flex flex-col gap-4">
                    <ConfluenceLadder signals={signals} timeframe={timeframe} />
                    <DerivativesPanel market={market} />
                  </div>
                  <SignalLockPanel signals={signals} market={market} timeframe={timeframe} onMethodology={() => setMethodology(true)} />
                </div>
              </>
            )}

            <div className="workspace-disclaimer">
              <ShieldCheck className="size-3 shrink-0 text-primary" />
              <p>
                Designed for discipline, not certainty. Signal Lock freezes a decision; it does not guarantee profit.
                {signalAge !== null && lock ? ` Current lock is ${Math.floor(signalAge / 60_000)}m ${Math.floor((signalAge % 60_000) / 1000)}s old.` : ''} Trade only with capital you can afford to lose.
              </p>
              <button onClick={() => setMethodology(true)} className="ml-auto shrink-0 text-primary hover:underline">
                Methodology <span aria-hidden="true">↗</span>
              </button>
            </div>
          </main>

          <footer className="status-footer">
            <div className="flex flex-wrap items-center gap-4">
              <span className="flex items-center gap-1.5">
                <StatusDot live={market.fresh} />
                <span className={market.fresh ? 'text-positive' : 'text-primary'}>{market.fresh ? 'MARKET FEED CONNECTED' : 'AWAITING VERIFIED FEED'}</span>
              </span>
              <span className="hidden sm:inline">{market.venue} · XAUUSDT PERP</span>
              <span className="hidden lg:inline">{market.socketStatus === 'live' ? 'Binance WebSocket · REST recovery' : 'REST recovery · auto fallback'}</span>
              <span className="hidden items-center gap-1.5 xl:flex"><Radio className="size-3" />{signals.analyses.filter(analysis => analysis.indicators).length}/7 TIMEFRAMES COMPUTED</span>
            </div>
            <span className="hidden items-center gap-1.5 sm:flex">
              <ShieldCheck className="size-3" />No simulated data
              <span className="mx-2 text-border">|</span>
              <span className="text-primary">AURUM v2</span>
            </span>
          </footer>
        </div>
      </div>

      <MethodologyDialog open={methodology} onOpenChange={setMethodology} venue={market.venue} tick={market.instrument?.tickSize?.toString()} />
    </div>
  )
}
