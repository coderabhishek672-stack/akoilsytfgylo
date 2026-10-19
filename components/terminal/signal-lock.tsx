'use client'

import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  Crosshair,
  Flame,
  Gauge,
  Info,
  LockKeyhole,
  Minus,
  ShieldAlert,
  ShieldCheck,
  Timer,
  TriangleAlert,
  Unlock,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Panel, DataRow, StatusDot } from './panel'
import type { MarketState } from '@/hooks/use-market'
import type { SignalState } from '@/hooks/use-signals'
import { TIMEFRAMES, formatCountdown, formatPrice, type Bias, type Confluence, type LockStage, type Timeframe, type TimeframeAnalysis } from '@/lib/market-types'
import { cn } from '@/lib/utils'

const STAGE_COPY: Record<LockStage, { label: string; tone: 'long' | 'short' | 'wait' | 'dead'; blurb: string }> = {
  SEARCHING: { label: 'SEARCHING', tone: 'wait', blurb: 'No timeframe has reached the arming score yet.' },
  ARMING: { label: 'ARMING', tone: 'wait', blurb: 'A direction is forming but the lock gates are not all satisfied.' },
  LOCKED: { label: 'LOCKED', tone: 'long', blurb: 'Levels are frozen. Price has not reached the entry yet.' },
  TRIGGERED: { label: 'ENTRY TRIGGERED', tone: 'long', blurb: 'Price reached the locked entry zone.' },
  'TARGET HIT': { label: 'TARGET REACHED', tone: 'long', blurb: 'The final target was reached. The plan is complete.' },
  INVALIDATED: { label: 'INVALIDATED', tone: 'dead', blurb: 'The stop level was breached. The plan is void.' },
  EXPIRED: { label: 'EXPIRED', tone: 'dead', blurb: 'The lock window elapsed without a resolution.' },
}

const toneClass = (tone: 'long' | 'short' | 'wait' | 'dead', direction?: 'LONG' | 'SHORT') => {
  if (tone === 'dead') return 'text-muted-foreground'
  if (tone === 'wait') return 'text-primary'
  return direction === 'SHORT' ? 'text-negative' : 'text-positive'
}

export function TimeframeSwitch({ analyses, active, onSelect, signals, market }: {
  analyses: TimeframeAnalysis[]
  active: Timeframe
  onSelect: (timeframe: Timeframe) => void
  signals: SignalState
  market: MarketState
}) {
  return (
    <div className="tf-switch" role="tablist" aria-label="Multi-timeframe signal switch">
      {TIMEFRAMES.map(timeframe => {
        const analysis = analyses.find(entry => entry.timeframe === timeframe)
        const bias: Bias = analysis?.indicators?.bias ?? 'NEUTRAL'
        const score = analysis?.indicators?.score ?? 0
        const isActive = active === timeframe
        const locked = analysis?.lock
        const pending = analysis?.evaluation
        return (
          <button
            key={timeframe}
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(timeframe)}
            className={cn('tf-chip', isActive && 'tf-chip-active', locked && 'tf-chip-locked')}
          >
            <span className="flex w-full items-center justify-between gap-2">
              <span className={cn('font-mono text-[11px] font-semibold', isActive ? 'text-primary' : 'text-foreground')}>{timeframe.toUpperCase()}</span>
              {locked && <LockKeyhole className="size-2.5 text-primary" />}
            </span>
            <span className={cn('mt-1.5 block font-mono text-[10px] font-medium', bias === 'BULLISH' ? 'text-positive' : bias === 'BEARISH' ? 'text-negative' : 'text-muted-foreground')}>
              {bias === 'NEUTRAL' ? 'FLAT' : `${score > 0 ? '+' : ''}${score}`}
            </span>
            <span className="mt-1 block h-0.5 w-full overflow-hidden rounded-full bg-border">
              <span
                className={cn('block h-full rounded-full', bias === 'BULLISH' ? 'bg-positive' : bias === 'BEARISH' ? 'bg-negative' : 'bg-muted-foreground/50')}
                style={{ width: `${Math.min(100, Math.abs(score))}%` }}
              />
            </span>
            <span className="mt-1.5 block text-[8px] tracking-wider text-muted-foreground">
              {locked ? `LOCK ${locked.grade}` : pending?.direction ? `ARM ${pending.direction === 'LONG' ? 'L' : 'S'}` : 'SCAN'}
            </span>
          </button>
        )
      })}
      <div className="tf-switch-status">
        <span className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
          <StatusDot live={market.fresh} />
          {market.fresh ? 'LIVE' : 'DELAYED'}
        </span>
        <span className="font-mono text-[9px] text-muted-foreground">
          {signals.isValidating ? 'recomputing…' : `poll ${Math.round(signals.pollMs / 1000)}s`}
        </span>
      </div>
    </div>
  )
}

export function SignalLockPanel({ signals, market, timeframe, onMethodology }: {
  signals: SignalState
  market: MarketState
  timeframe: Timeframe
  onMethodology: () => void
}) {
  const analysis = signals.analysis
  const lock = signals.lock
  const evaluation = analysis?.evaluation ?? null
  const stage: LockStage = lock ? lock.stage : evaluation?.direction ? 'ARMING' : 'SEARCHING'
  const copy = STAGE_COPY[stage]
  const direction = lock?.direction ?? evaluation?.direction ?? null
  const long = direction === 'LONG'
  const confidence = lock?.confidence ?? evaluation?.confidence ?? 0
  const gates = lock?.gates ?? evaluation?.gates ?? []
  const levels = lock?.levels ?? evaluation?.previewLevels ?? null
  const passedGates = gates.filter(gate => gate.pass).length
  const price = market.midPrice ?? market.ticker?.last ?? signals.data?.price ?? 0
  const decimals = (market.instrument?.tickSize ?? 0.01) < 1 ? 2 : 1
  const expiryMs = lock ? Math.max(0, lock.expiresTime - (market.now || Date.now())) : null
  const tone = copy.tone === 'long' && direction === 'SHORT' ? 'short' : copy.tone

  return (
    <Panel
      title="Signal lock"
      icon={<Crosshair className="size-3.5" />}
      className="signal-panel"
      action={
        <div className="flex items-center gap-2">
          {lock ? (
            <Badge variant="outline" className={cn('h-5 rounded px-1.5 font-mono text-[9px]', lock.grade === 'A+' ? 'border-positive/40 bg-positive/10 text-positive' : lock.grade === 'A' ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border text-muted-foreground')}>
              GRADE {lock.grade}
            </Badge>
          ) : levels ? (
            <Badge variant="outline" className="h-5 rounded border-border px-1.5 font-mono text-[9px] text-muted-foreground">
              PREVIEW
            </Badge>
          ) : null}
          <Badge variant="outline" className="h-5 rounded border-primary/25 bg-primary/5 px-1.5 font-mono text-[9px] text-primary">
            {timeframe.toUpperCase()} ENGINE
          </Badge>
        </div>
      }
    >
      <div className="flex flex-col gap-3.5 p-4">
        <div className={cn('signal-status', lock && tone === 'long' && 'signal-long', lock && tone === 'short' && 'signal-short')}>
          <div className="flex items-start justify-between">
            <span className="text-[9px] font-medium tracking-[0.15em] text-muted-foreground uppercase">Lock state</span>
            <span className={cn('flex items-center gap-1 text-[9px]', lock ? 'text-primary' : 'text-muted-foreground')}>
              {lock ? <LockKeyhole className="size-2.5" /> : <Unlock className="size-2.5" />}
              {lock ? 'LEVELS FROZEN' : levels ? 'PREVIEW · NOT LOCKED' : 'AWAITING SETUP'}
            </span>
          </div>
          <div className={cn('mt-2.5 flex items-center gap-2 text-[23px] leading-none font-semibold tracking-tight', toneClass(tone, direction ?? undefined))}>
            {direction ? long ? <ArrowUpRight className="size-6" /> : <ArrowDownRight className="size-6" /> : <Timer className="size-5" />}
            {copy.label}
            {direction && <span className="ml-1 text-[13px] font-normal text-muted-foreground">{direction}</span>}
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            {analysis?.error ?? (lock ? lock.reasons[0] ?? copy.blurb : evaluation?.reason ?? copy.blurb)}
          </p>

          <div className="mt-3.5 flex items-center justify-between text-[10px]">
            <span className="flex items-center gap-1.5 text-muted-foreground"><Gauge className="size-3" />Lock confidence</span>
            <span className={cn('font-mono font-medium', toneClass(tone, direction ?? undefined))}>{confidence}%</span>
          </div>
          <div className="mt-2 flex gap-0.5" aria-label={`${confidence} percent confidence`}>
            {Array.from({ length: 25 }, (_, index) => (
              <span
                key={index}
                className={cn(
                  'h-1.5 flex-1 rounded-sm',
                  index < confidence / 4
                    ? tone === 'short'
                      ? 'bg-negative'
                      : tone === 'long'
                        ? 'bg-positive'
                        : 'bg-primary/70'
                    : 'bg-muted',
                )}
              />
            ))}
          </div>
          <p className="mt-1.5 text-[9px] text-muted-foreground">Weighted indicator and timeframe agreement. Not a probability of profit.</p>
        </div>

        <div className="entry-box">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[10px] font-medium text-primary"><Crosshair className="size-3" /> IDEAL ENTRY</span>
            <span className="font-mono text-[9px] text-muted-foreground">
              {levels ? `${levels.riskPerUnit.toFixed(decimals)} risk / unit` : 'USDT'}
            </span>
          </div>
          <div className="mt-1.5 font-mono text-[30px] leading-none font-medium tracking-tight text-primary">
            {formatPrice(levels?.idealEntry, decimals)}
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
            <span>Entry zone</span>
            <span className="text-right font-mono text-foreground">
              {levels ? `${formatPrice(levels.zoneLow, decimals)} – ${formatPrice(levels.zoneHigh, decimals)}` : '—'}
            </span>
            <span>Aggressive entry</span>
            <span className="text-right font-mono text-foreground">{formatPrice(levels?.aggressiveEntry, decimals)}</span>
            <span>Market entry now</span>
            <span className="text-right font-mono text-foreground">{price > 0 ? formatPrice(price, decimals) : '—'}</span>
            <span>Distance to entry</span>
            <span className={cn('text-right font-mono', (lock?.distanceToEntry ?? 0) < (analysis?.indicators?.atr ?? 0) ? 'text-positive' : 'text-foreground')}>
              {lock
                ? `${formatPrice(lock.distanceToEntry, decimals)} (${(lock.distanceToEntry / (analysis?.indicators?.atr || 1)).toFixed(2)} ATR)`
                : levels
                  ? `${formatPrice(Math.abs(price - levels.idealEntry), decimals)} to preview entry`
                  : '—'}
            </span>
          </div>
          <div className="mt-2.5">
            <div className="flex justify-between text-[9px] text-muted-foreground">
              <span>Progress to entry</span>
              <span className="font-mono">{lock ? `${lock.progress.toFixed(0)}%` : levels ? 'not locked' : '—'}</span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
              <div className={cn('h-full rounded-full', long ? 'bg-positive' : 'bg-negative')} style={{ width: `${lock?.progress ?? 0}%` }} />
            </div>
          </div>
        </div>

        <div className="-my-1 divide-y divide-border/60">
          <DataRow label="Stop loss · invalidation" className="text-negative">{formatPrice(levels?.stopLoss, decimals)}</DataRow>
          {(levels?.targets ?? [null, null, null]).map((target, index) => (
            <DataRow key={index} label={`Target ${index + 1}`} className="text-positive">
              {formatPrice(target, decimals)}
              <span className="ml-1 text-[9px] text-muted-foreground">{index + 1}R</span>
            </DataRow>
          ))}
          <DataRow label="Risk / reward to final target">
            {levels ? `1 : ${levels.riskReward[levels.riskReward.length - 1]}` : '—'}
          </DataRow>
          <DataRow label="Lock expires in">
            {expiryMs === null ? '—' : formatCountdown(expiryMs)}
          </DataRow>
        </div>

        <div className="rounded-md border border-border bg-background/40 px-3 py-2.5">
          <div className="mb-2 flex justify-between text-[9px] font-medium tracking-wider uppercase">
            <span className="flex items-center gap-1.5 text-muted-foreground"><ShieldCheck className="size-3" />Lock gates</span>
            <span className={cn(passedGates === gates.length && gates.length > 0 ? 'text-positive' : 'text-primary')}>
              {gates.length ? `${passedGates} / ${gates.length} PASSED` : '—'}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            {gates.map(gate => (
              <div key={gate.name} className="flex items-start gap-2 text-[10px]">
                {gate.pass ? <Check className="mt-0.5 size-3 shrink-0 text-positive" /> : <Minus className="mt-0.5 size-3 shrink-0 text-muted-foreground" />}
                <span className="min-w-0 flex-1">
                  <span className={gate.pass ? 'text-foreground' : 'text-muted-foreground'}>{gate.name}</span>
                  <span className="block font-mono text-[9px] text-muted-foreground">{gate.detail}</span>
                </span>
              </div>
            ))}
            {!gates.length && <span className="text-[10px] text-muted-foreground">Waiting for enough closed candles to evaluate gates.</span>}
          </div>
        </div>

        {!lock && levels && (
          <div className="rounded-md border border-border bg-background/40 px-3 py-2.5 text-[10px] leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Preview only.</span> These are the levels the engine would lock right now if the remaining gates passed.
            Nothing is committed until the state reads <span className="font-mono text-primary">LOCKED</span>, and a preview may shift between polls.
          </div>
        )}

        {!!lock?.reasons.length && (
          <div className="rounded-md border border-positive/15 bg-positive/4 px-3 py-2.5">
            <div className="mb-1.5 flex items-center gap-1.5 text-[9px] font-medium tracking-wider text-positive uppercase">
              <Flame className="size-3" />Why this locked
            </div>
            <ul className="space-y-1">
              {lock.reasons.map(reason => (
                <li key={reason} className="flex gap-1.5 text-[10px] leading-relaxed text-muted-foreground">
                  <Check className="mt-0.5 size-3 shrink-0 text-positive" />
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!!(lock?.warnings.length || (market.warnings.length > 0)) && (
          <div className="rounded-md border border-primary/15 bg-primary/4 px-3 py-2.5">
            <div className="mb-1.5 flex items-center gap-1.5 text-[9px] font-medium tracking-wider text-primary uppercase">
              <ShieldAlert className="size-3" />Risk notes
            </div>
            <ul className="space-y-1">
              {(lock?.warnings ?? []).map(warning => (
                <li key={warning} className="flex gap-1.5 text-[10px] leading-relaxed text-muted-foreground">
                  <TriangleAlert className="mt-0.5 size-3 shrink-0 text-primary" />
                  <span>{warning}</span>
                </li>
              ))}
              {market.warnings.slice(0, 2).map(warning => (
                <li key={warning} className="flex gap-1.5 text-[10px] leading-relaxed text-muted-foreground">
                  <TriangleAlert className="mt-0.5 size-3 shrink-0 text-primary" />
                  <span>{warning}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Button variant="outline" className="h-8 w-full justify-between rounded-md border-border bg-transparent text-[10px] text-muted-foreground" onClick={onMethodology}>
          <span className="flex items-center gap-2"><Info className="size-3!" />How Signal Lock is calculated</span>
          <Info className="size-3! opacity-0" />
        </Button>
      </div>

      <div className="mt-auto flex items-start gap-2 border-t border-border px-4 py-2.5 text-[9px] leading-relaxed text-muted-foreground">
        <TriangleAlert className="mt-0.5 size-3 shrink-0 text-primary" />
        <span>Locked levels never move. A breached stop invalidates the plan instead of reversing it. This terminal does not place orders.</span>
      </div>
    </Panel>
  )
}

export function ConfluenceLadder({ signals, timeframe }: { signals: SignalState; timeframe: Timeframe }) {
  const lock = signals.lock
  const active = signals.analysis
  const confluences: Confluence[] = lock?.confluences?.length
    ? lock.confluences
    : (active?.confluences.length ? active.confluences : signals.analyses.filter(analysis => analysis.confluences.length).flatMap(analysis => analysis.confluences))
      .filter((entry, index, all) => all.findIndex(candidate => candidate.timeframe === entry.timeframe) === index)
      .sort((a, b) => b.weight - a.weight)

  return (
    <Panel
      title="Multi-timeframe confluence"
      icon={<Gauge className="size-3.5" />}
      action={
        <span className="font-mono text-[9px] text-muted-foreground">
          {confluences.filter(entry => entry.aligned).length}/{confluences.length} ALIGNED
          {!lock && <span className="ml-2 text-primary/80">NO LOCK YET</span>}
        </span>
      }
    >
      <div className="divide-y divide-border/60 px-4">
        {confluences.map(entry => (
          <div key={entry.timeframe} className="flex items-center gap-3 py-2.5">
            <span className={cn('w-9 font-mono text-[11px] font-medium', entry.timeframe === timeframe ? 'text-primary' : 'text-foreground')}>
              {entry.timeframe.toUpperCase()}
            </span>
            <span className="flex-1">
              <span className="block h-1 overflow-hidden rounded-full bg-muted">
                <span
                  className={cn('block h-full rounded-full', entry.bias === 'BULLISH' ? 'bg-positive' : entry.bias === 'BEARISH' ? 'bg-negative' : 'bg-muted-foreground/40')}
                  style={{ width: `${Math.min(100, Math.abs(entry.score))}%` }}
                />
              </span>
            </span>
            <span className={cn('w-10 text-right font-mono text-[10px]', entry.bias === 'BULLISH' ? 'text-positive' : entry.bias === 'BEARISH' ? 'text-negative' : 'text-muted-foreground')}>
              {entry.score > 0 ? '+' : ''}{entry.score}
            </span>
            <span className="w-12 text-right">
              {entry.aligned ? (
                <span className="inline-flex items-center gap-1 text-[9px] text-positive"><Check className="size-2.5" />YES</span>
              ) : (
                <span className="text-[9px] text-muted-foreground">NO</span>
              )}
            </span>
          </div>
        ))}
        {!confluences.length && <div className="py-6 text-center text-[10px] text-muted-foreground">Waiting for the first multi-timeframe snapshot.</div>}
      </div>
      <div className="mt-auto flex items-center justify-between border-t border-border px-4 py-2.5 text-[9px] text-muted-foreground">
        <span>Slower timeframes carry more weight</span>
        <span className="font-mono">{signals.consensus ? `${signals.consensus.bias} · ${signals.consensus.score > 0 ? '+' : ''}${signals.consensus.score}` : '—'}</span>
      </div>
    </Panel>
  )
}

export function ConsensusStrip({ signals }: { signals: SignalState }) {
  const consensus = signals.consensus
  return (
    <div className="consensus-strip">
      <div className="flex items-center gap-2">
        <span className="text-[9px] tracking-[0.15em] text-muted-foreground uppercase">Timeframe consensus</span>
        <Badge
          variant="outline"
          className={cn(
            'h-5 rounded px-1.5 font-mono text-[9px]',
            consensus?.bias === 'BULLISH' ? 'border-positive/30 text-positive' : consensus?.bias === 'BEARISH' ? 'border-negative/30 text-negative' : 'border-border text-muted-foreground',
          )}
        >
          {consensus?.bias ?? 'NEUTRAL'} {consensus ? `${consensus.score > 0 ? '+' : ''}${consensus.score}` : ''}
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-4 font-mono text-[9px] text-muted-foreground">
        <span className="text-positive">{consensus?.bullish ?? 0} BULLISH</span>
        <span>{consensus?.neutral ?? 0} NEUTRAL</span>
        <span className="text-negative">{consensus?.bearish ?? 0} BEARISH</span>
        <span>ALIGNMENT {consensus?.alignment ?? 0}%</span>
      </div>
    </div>
  )
}
