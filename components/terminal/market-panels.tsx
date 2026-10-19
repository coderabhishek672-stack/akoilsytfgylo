'use client'

import { useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpRight, Check, ChevronDown, CircleDot, Layers, ListFilter, Radio, Scale, SlidersHorizontal, Zap } from 'lucide-react'
import { Panel, DataRow, StatusDot } from './panel'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { MarketState } from '@/hooks/use-market'
import type { SignalState } from '@/hooks/use-signals'
import { compact, formatPrice, formatTime, type Timeframe } from '@/lib/market-types'
import { cn } from '@/lib/utils'

export function IndicatorPanel({ market, signals, timeframe }: { market: MarketState; signals: SignalState; timeframe: Timeframe }) {
  const indicators = signals.analysis?.indicators ?? null
  const decimals = (market.instrument?.tickSize ?? 0.01) < 1 ? 2 : 1
  return (
    <Panel
      title="Indicator engine"
      icon={<SlidersHorizontal className="size-3.5" />}
      action={<span className="font-mono text-[9px] text-muted-foreground">CLOSED · {timeframe.toUpperCase()}</span>}
    >
      <div className="px-4">
        <div className="flex justify-between border-b border-border py-2.5 text-[9px] tracking-wider text-muted-foreground uppercase">
          <span>Model / parameter</span>
          <span>Directional vote</span>
        </div>
        {indicators ? (
          indicators.readings.map(reading => (
            <div key={reading.name} className="flex items-center justify-between gap-2 border-b border-border/60 py-2.5 last:border-0">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[11px] font-medium">
                  {reading.name}
                  <span className="font-mono text-[8px] text-muted-foreground">×{reading.weight.toFixed(1)}</span>
                </div>
                <div className="mt-0.5 truncate font-mono text-[9px] text-muted-foreground">
                  {reading.detail} <span className="text-foreground/80">· {reading.display}</span>
                </div>
              </div>
              <span
                className={cn(
                  'flex shrink-0 items-center gap-1 text-[9px] font-medium',
                  reading.direction === 'LONG' ? 'text-positive' : reading.direction === 'SHORT' ? 'text-negative' : 'text-muted-foreground',
                )}
              >
                {reading.direction === 'LONG' ? <ArrowUpRight className="size-3" /> : reading.direction === 'SHORT' ? <ArrowDown className="size-3" /> : <CircleDot className="size-2.5" />}
                {reading.direction === 'LONG' ? 'BULLISH' : reading.direction === 'SHORT' ? 'BEARISH' : 'NEUTRAL'}
              </span>
            </div>
          ))
        ) : (
          <div className="flex min-h-56 items-center justify-center px-4 text-center text-xs text-muted-foreground">
            {signals.analysis?.error ?? 'Waiting for verified closed candles'}
          </div>
        )}
      </div>
      <div className="mt-auto flex items-center justify-between border-t border-border px-4 py-2.5 text-[9px] text-muted-foreground">
        <span>{indicators ? `${indicators.readings.length} weighted factors` : 'no data'}</span>
        <span className="font-mono text-primary">{indicators ? `score ${indicators.score > 0 ? '+' : ''}${indicators.score}` : '—'}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-border px-4 py-2.5 font-mono text-[9px] text-muted-foreground">
        {indicators && (
          <>
            <span>RSI <b className="text-foreground">{indicators.rsi.toFixed(1)}</b></span>
            <span>ADX <b className="text-foreground">{indicators.adx.toFixed(1)}</b></span>
            <span>ATR <b className="text-foreground">{formatPrice(indicators.atr, decimals)}</b></span>
            <span>ATR% <b className="text-foreground">{indicators.atrPct.toFixed(2)}%</b></span>
            <span>EMA21 <b className="text-foreground">{formatPrice(indicators.ema21, decimals)}</b></span>
            <span>EMA50 <b className="text-foreground">{formatPrice(indicators.ema50, decimals)}</b></span>
            <span>VWAP <b className="text-foreground">{formatPrice(indicators.vwap, decimals)}</b></span>
            <span>BB width <b className="text-foreground">{indicators.bbWidth.toFixed(2)}%</b></span>
          </>
        )}
      </div>
    </Panel>
  )
}

export function OrderBookPanel({ market, signals }: { market: MarketState; signals: SignalState }) {
  const book = market.book
  const decimals = (market.instrument?.tickSize ?? 0.01) < 1 ? 2 : 1
  const bids = book?.bids.slice(0, 12) ?? []
  const asks = book?.asks.slice(0, 12) ?? []
  const max = Math.max(1, ...[...bids, ...asks].map(level => level.size))
  const bidTotal = bids.reduce((sum, level) => sum + level.size, 0)
  const askTotal = asks.reduce((sum, level) => sum + level.size, 0)
  const total = bidTotal + askTotal
  const buyRatio = total ? (bidTotal / total) * 100 : null
  const lock = signals.lock

  const row = (level: { price: number; size: number }, side: 'buy' | 'sell') => (
    <div key={`${side}-${level.price}`} className="relative grid grid-cols-3 gap-2 px-4 py-[2px] text-right font-mono text-[10px]">
      <div
        className={cn('pointer-events-none absolute inset-y-0 right-4', side === 'buy' ? 'bg-positive/10' : 'bg-negative/10')}
        style={{ width: `${(level.size / max) * 88}%` }}
      />
      <span className={cn('relative text-left', side === 'buy' ? 'text-positive' : 'text-negative')}>{formatPrice(level.price, decimals)}</span>
      <span className="relative">{formatPrice(level.size, 3)}</span>
      <span className="relative text-muted-foreground">{((level.size / (side === 'buy' ? bidTotal : askTotal || 1)) * 100).toFixed(1)}%</span>
    </div>
  )

  return (
    <Panel
      title="Order book depth"
      icon={<Layers className="size-3.5" />}
      action={
        <span className="flex items-center gap-1.5 text-[9px] font-normal tracking-normal normal-case text-muted-foreground">
          <StatusDot live={market.bookAge !== null && market.bookAge < 5_000} />
          {market.bookAge === null ? 'no book' : `${market.bookAge} ms`}
        </span>
      }
    >
      <div className="grid grid-cols-3 gap-2 px-4 py-2.5 text-right text-[9px] text-muted-foreground">
        <span className="text-left">Price (USDT)</span>
        <span>Size (XAU)</span>
        <span>Share</span>
      </div>
      {book ? (
        <>
          <div>{[...asks].reverse().map(level => row(level, 'sell'))}</div>
          <div className="my-1.5 flex items-center justify-between border-y border-border bg-background/40 px-4 py-2">
            <span className={cn('flex items-center gap-1.5 font-mono text-base', (market.ticker?.changePct24h ?? 0) >= 0 ? 'text-positive' : 'text-negative')}>
              {formatPrice(market.midPrice ?? market.ticker?.last, decimals)}
              {(market.ticker?.changePct24h ?? 0) >= 0 ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}
            </span>
            <span className="text-[9px] text-muted-foreground">
              Spread <span className="ml-1 font-mono text-foreground">{formatPrice(market.spread, decimals)}</span>
            </span>
          </div>
          <div>{bids.map(level => row(level, 'buy'))}</div>
        </>
      ) : (
        <div className="flex min-h-56 items-center justify-center text-xs text-muted-foreground">Order book unavailable</div>
      )}
      {lock && (
        <div className="border-t border-border px-4 py-2 text-[9px] text-muted-foreground">
          Locked entry <span className="font-mono text-primary">{formatPrice(lock.levels.idealEntry, decimals)}</span> sits{' '}
          {lock.direction === 'LONG' ? 'below' : 'above'} the mid price — a retracement entry.
        </div>
      )}
      <div className="mt-auto px-4 pt-2.5 pb-2.5">
        <div className="mb-1.5 flex justify-between font-mono text-[9px]">
          <span className="text-positive">B {buyRatio === null ? '—' : `${buyRatio.toFixed(1)}%`}</span>
          <span className="text-muted-foreground">Top 12 depth</span>
          <span className="text-negative">A {buyRatio === null ? '—' : `${(100 - buyRatio).toFixed(1)}%`}</span>
        </div>
        <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-sm bg-muted">
          {buyRatio !== null && (
            <>
              <div className="bg-positive/80" style={{ width: `${buyRatio}%` }} />
              <div className="flex-1 bg-negative/80" />
            </>
          )}
        </div>
      </div>
    </Panel>
  )
}

export function TradeTape({ market }: { market: MarketState }) {
  const decimals = (market.instrument?.tickSize ?? 0.01) < 1 ? 2 : 1
  const trades = market.trades.slice(0, 22)
  const buyVolume = trades.filter(trade => trade.side === 'BUY').reduce((sum, trade) => sum + trade.size, 0)
  const sellVolume = trades.filter(trade => trade.side === 'SELL').reduce((sum, trade) => sum + trade.size, 0)
  const totalVolume = buyVolume + sellVolume
  const pressure = totalVolume ? (buyVolume / totalVolume) * 100 : null
  return (
    <Panel
      title="Time & sales"
      icon={<Zap className="size-3.5" />}
      action={<span className="font-mono text-[9px] text-muted-foreground">{market.socketStatus === 'live' ? 'WS TAPE' : 'REST TAPE'}</span>}
    >
      <div className="grid grid-cols-3 gap-2 px-4 py-2.5 text-right text-[9px] text-muted-foreground">
        <span className="text-left">Time</span>
        <span>Price</span>
        <span>Size (XAU)</span>
      </div>
      <div className="max-h-[286px] overflow-y-auto">
        {trades.map(trade => (
          <div key={trade.id} className="grid grid-cols-3 gap-2 px-4 py-[3px] text-right font-mono text-[10px]">
            <span className="text-left text-muted-foreground">{formatTime(trade.ts)}</span>
            <span className={trade.side === 'BUY' ? 'text-positive' : 'text-negative'}>{formatPrice(trade.price, decimals)}</span>
            <span className="text-foreground/90">{formatPrice(trade.size, 3)}</span>
          </div>
        ))}
        {!trades.length && <div className="flex min-h-40 items-center justify-center text-xs text-muted-foreground">Waiting for the first prints…</div>}
      </div>
      <div className="mt-auto border-t border-border px-4 py-2.5">
        <div className="mb-1.5 flex justify-between font-mono text-[9px]">
          <span className="text-positive">BUY {pressure === null ? '—' : `${pressure.toFixed(0)}%`}</span>
          <span className="text-muted-foreground">Tape pressure</span>
          <span className="text-negative">SELL {pressure === null ? '—' : `${(100 - pressure).toFixed(0)}%`}</span>
        </div>
        <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-sm bg-muted">
          {pressure !== null && (
            <>
              <div className="bg-positive/80" style={{ width: `${pressure}%` }} />
              <div className="flex-1 bg-negative/80" />
            </>
          )}
        </div>
      </div>
    </Panel>
  )
}

export function DerivativesPanel({ market }: { market: MarketState }) {
  const { derivatives, now } = market
  const fresh = derivatives && now - derivatives.ts < 60_000
  const fundingIn = derivatives?.fundingTime ? derivatives.fundingTime - now : null
  return (
    <Panel
      title="Perpetual microstructure"
      icon={<Radio className="size-3.5" />}
      action={
        <span className="flex items-center gap-1.5 text-[9px] font-normal tracking-normal normal-case text-muted-foreground">
          <StatusDot live={!!fresh} />
          {fresh ? 'Verified feed' : 'Feed pending'}
        </span>
      }
    >
      <div className="divide-y divide-border/60 px-4 py-1">
        <DataRow label="Mark price">{formatPrice(derivatives?.markPrice, 2)} <span className="text-[9px] text-muted-foreground">USDT</span></DataRow>
        <DataRow label="Index price">{formatPrice(derivatives?.indexPrice, 2)}</DataRow>
        <DataRow label="Funding rate" className="text-primary">
          {derivatives?.fundingRate === null || derivatives?.fundingRate === undefined ? '—' : `${(derivatives.fundingRate * 100).toFixed(4)}%`}
        </DataRow>
        <DataRow label="Next funding">
          {derivatives?.fundingTime ? `${formatTime(derivatives.fundingTime, false)} UTC${fundingIn !== null && fundingIn > 0 ? ` · ${Math.floor(fundingIn / 3_600_000)}h` : ''}` : '—'}
        </DataRow>
        <DataRow label="Open interest">
          {derivatives?.openInterestUsd ? `$${compact(derivatives.openInterestUsd)}` : derivatives?.openInterest ? compact(derivatives.openInterest) : '—'}
        </DataRow>
        <DataRow label="Contract unit">{market.instrument ? `1 contract = ${market.instrument.contractSize} ${market.instrument.contractUnit}` : '—'}</DataRow>
        <DataRow label="Price tick">{market.instrument ? `${market.instrument.tickSize} USDT` : '—'}</DataRow>
        <DataRow label="24h volume">{compact(market.ticker?.quoteVolume24h)} <span className="text-[9px] text-muted-foreground">USDT</span></DataRow>
        <DataRow label="Feed latency">
          {market.latency === null ? '—' : `${market.latency} ms`}
          <span className="ml-1 text-[9px] text-muted-foreground">socket</span>
        </DataRow>
        <DataRow label="REST batch">
          {market.snapshotLatency === null ? '—' : `${market.snapshotLatency} ms`}
        </DataRow>
      </div>
      <div className="mx-4 mt-auto mb-3 flex items-start gap-2 rounded-md border border-primary/15 bg-primary/4 p-2.5 text-[9px] leading-relaxed text-muted-foreground">
        <Check className="mt-0.5 size-3 shrink-0 text-primary" />
        <span>Quotes, depth and the tape stream live from the Binance USDⓈ-M XAUUSDT perpetual WebSocket. Where the Binance REST host is region-restricted, candle history is served by the OKX XAU-USDT perpetual instead, and the venue label always shows which source is live.</span>
      </div>
    </Panel>
  )
}

export function SignalHistory({ signals }: { signals: SignalState }) {
  const [onlyLocked, setOnlyLocked] = useState(false)
  const events = signals.analyses
    .flatMap(analysis => analysis.history)
    .sort((a, b) => b.time - a.time)
    .filter(event => !onlyLocked || event.type === 'LOCKED')
    .slice(0, 14)

  return (
    <Panel
      title="Signal activity"
      icon={<ListFilter className="size-3.5" />}
      action={
        <div className="flex items-center gap-3">
          <span className="hidden text-[9px] font-normal tracking-normal normal-case text-muted-foreground sm:inline">UTC session · rule-based replay</span>
          <Button variant="ghost" size="xs" className="h-5 text-[9px] text-muted-foreground" onClick={() => setOnlyLocked(value => !value)}>
            {onlyLocked ? 'Locks only' : 'All events'}
            <ChevronDown className="size-2.5!" />
          </Button>
        </div>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-140 text-left text-[10px]">
          <thead>
            <tr className="border-b border-border text-[9px] tracking-wider text-muted-foreground uppercase">
              {['Time (UTC)', 'TF', 'Event', 'Direction', 'Locked entry', 'Grade', 'Confidence'].map(label => (
                <th key={label} className="px-4 py-2.5 font-normal">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {events.map((event, index) => (
              <tr key={`${event.time}-${event.timeframe}-${index}`} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-2.5 font-mono text-muted-foreground">{formatTime(event.time)}</td>
                <td className="px-4 py-2.5 font-mono text-primary">{event.timeframe.toUpperCase()}</td>
                <td className="px-4 py-2.5">
                  <Badge
                    variant="outline"
                    className={cn(
                      'h-5 rounded px-1.5 text-[8px]',
                      event.type === 'LOCKED'
                        ? 'border-primary/30 text-primary'
                        : event.type === 'TARGET HIT'
                          ? 'border-positive/30 text-positive'
                          : event.type === 'INVALIDATED'
                            ? 'border-negative/30 text-negative'
                            : 'border-border text-muted-foreground',
                    )}
                  >
                    {event.type}
                  </Badge>
                </td>
                <td className={cn('px-4 py-2.5 font-medium', event.direction === 'LONG' ? 'text-positive' : 'text-negative')}>{event.direction}</td>
                <td className="px-4 py-2.5 font-mono">{formatPrice(event.entry, 2)}</td>
                <td className="px-4 py-2.5 font-mono">{event.grade}</td>
                <td className="px-4 py-2.5 font-mono">{event.confidence}%</td>
              </tr>
            ))}
            {!events.length && (
              <tr>
                <td colSpan={7} className="px-4 py-7 text-center text-muted-foreground">
                  No signal events in the current UTC session yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="border-t border-border px-4 py-2.5 text-[9px] text-muted-foreground">
        Activity is a deterministic replay of today&apos;s real closed candles, not a record of executed trades. Touching a level does not prove an order filled.
      </p>
    </Panel>
  )
}

export function RiskSizer({ market, signals }: { market: MarketState; signals: SignalState }) {
  const [equity, setEquity] = useState('10000')
  const [riskPct, setRiskPct] = useState('0.5')
  const lock = signals.lock
  const valid = Number(equity) > 0 && Number(riskPct) > 0 && Number(riskPct) <= 2 && Number(equity) <= 1_000_000_000
  const risk = valid ? (Number(equity) * Number(riskPct)) / 100 : null
  const contractSize = market.instrument?.contractSize ?? 1
  const riskPerUnit = lock?.levels.riskPerUnit ?? null
  const rawUnits = risk !== null && riskPerUnit ? risk / riskPerUnit : null
  const units = rawUnits !== null ? rawUnits / contractSize : null
  const notional = units !== null && lock ? units * contractSize * lock.levels.idealEntry : null
  const leverage = notional !== null && Number(equity) > 0 ? notional / Number(equity) : null

  return (
    <Panel
      title="Position calculator"
      icon={<Scale className="size-3.5" />}
      action={<span className="text-[9px] text-muted-foreground">NOT AN ORDER</span>}
    >
      <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-[10px] text-muted-foreground">
          Account equity · USDT
          <input
            type="number"
            min="1"
            max="1000000000"
            value={equity}
            onChange={event => setEquity(event.target.value)}
            className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-foreground outline-none focus:border-primary"
          />
        </label>
        <label className="text-[10px] text-muted-foreground">
          Risk per setup · %
          <input
            type="number"
            min="0.01"
            max="2"
            step="0.1"
            value={riskPct}
            onChange={event => setRiskPct(event.target.value)}
            className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-foreground outline-none focus:border-primary"
          />
        </label>
        <div>
          <div className="text-[10px] text-muted-foreground">Size at locked risk</div>
          <div className="mt-3 font-mono text-lg text-primary">
            {formatPrice(units, 2)} <span className="text-[10px] text-muted-foreground">XAU</span>
          </div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">Planned loss at stop</div>
          <div className="mt-3 font-mono text-lg">
            {formatPrice(risk)} <span className="text-[10px] text-muted-foreground">USDT</span>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 border-t border-border px-4 py-3 md:grid-cols-4">
        <DataRow label="Notional">{notional === null ? '—' : `${formatPrice(notional)} USDT`}</DataRow>
        <DataRow label="Effective leverage">{leverage === null ? '—' : `${leverage.toFixed(2)}×`}</DataRow>
        <DataRow label="Risk / unit">{riskPerUnit === null ? '—' : formatPrice(riskPerUnit, 2)}</DataRow>
        <DataRow label="Locked R:R">{lock ? `1 : ${lock.levels.riskReward[lock.levels.riskReward.length - 1]}` : '—'}</DataRow>
      </div>
      <p className="border-t border-border px-4 py-3 text-[10px] text-muted-foreground">
        {!valid
          ? 'Enter positive equity and a risk between 0.01% and 2%.'
          : !lock
            ? 'A position size appears once a Signal Lock is active on the selected timeframe.'
            : 'Sizes use the locked stop distance and the venue contract unit. Fees, funding, slippage and gaps are excluded. Inputs are not saved.'}
      </p>
    </Panel>
  )
}
