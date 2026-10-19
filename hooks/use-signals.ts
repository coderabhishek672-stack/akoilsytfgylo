'use client'

/**
 * Multi-timeframe signal hook.
 *
 * The heavy indicator work runs on the server (/api/market/signals) and is polled on a
 * cadence tied to the active timeframe. The browser only re-evaluates the *stage* of an
 * already-locked plan against the live price, so a lock can be invalidated in real time
 * without ever being re-drawn or moved.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { fetcher, type MarketState } from './use-market'
import { TF_MS, type SignalLock, type SignalSnapshot, type Timeframe, type TimeframeAnalysis } from '@/lib/market-types'

const POLL_MS: Record<Timeframe, number> = {
  '1m': 6_000,
  '3m': 8_000,
  '5m': 10_000,
  '15m': 15_000,
  '30m': 20_000,
  '1h': 30_000,
  '3h': 45_000,
}

function stageOf(lock: SignalLock, price: number, now: number): { stage: SignalLock['stage']; progress: number } {
  const { direction, levels } = lock
  const long = direction === 'LONG'
  const stop = levels.stopLoss
  const entry = levels.idealEntry
  const finalTarget = levels.targets[levels.targets.length - 1]
  const firstTarget = levels.targets[0]

  if (long ? price <= stop : price >= stop) return { stage: 'INVALIDATED', progress: 0 }
  if (long ? price >= finalTarget : price <= finalTarget) return { stage: 'TARGET HIT', progress: 100 }
  if (long ? price >= firstTarget : price <= firstTarget) return { stage: 'TRIGGERED', progress: 100 }

  const span = Math.abs(entry - stop) || 1
  const progress = Math.max(0, Math.min(100, (1 - Math.abs(price - entry) / span) * 100))
  if (long ? price <= entry : price >= entry) return { stage: 'TRIGGERED', progress: 100 }
  if (now >= lock.expiresTime) return { stage: 'EXPIRED', progress: 0 }
  return { stage: 'LOCKED', progress }
}

export function useSignals(timeframe: Timeframe, market: MarketState) {
  const [retryKey, setRetryKey] = useState(0)
  const pollMs = POLL_MS[timeframe]
  const request = useSWR<SignalSnapshot>(`/api/market/signals?tf=${timeframe}`, fetcher, {
    refreshInterval: pollMs,
    dedupingInterval: 2_000,
    errorRetryInterval: 5_000,
    keepPreviousData: true,
  })

  // Remember the most recent plan for this timeframe so an in-flight invalidation stays visible
  // even if the next poll happens to return a fresh, unrelated lock.
  const remembered = useRef<Map<Timeframe, SignalLock | null>>(new Map())
  const rawLock = request.data?.lock ?? null
  useEffect(() => {
    if (request.data) remembered.current.set(timeframe, rawLock)
  }, [request.data, rawLock, timeframe])

  const price = market.midPrice ?? market.ticker?.last ?? request.data?.price ?? 0

  const liveLock = useMemo(() => {
    const base = rawLock ?? remembered.current.get(timeframe) ?? null
    if (!base) return null
    const evaluated = stageOf(base, price, market.now || Date.now())
    const distanceToEntry = price > 0 ? Math.abs(price - base.levels.idealEntry) : base.distanceToEntry
    return { ...base, stage: evaluated.stage, progress: evaluated.progress, distanceToEntry }
  }, [rawLock, price, market.now, timeframe])

  const analysis: TimeframeAnalysis | null =
    request.data?.analyses.find(entry => entry.timeframe === timeframe) ?? null

  return {
    data: request.data ?? null,
    analysis,
    lock: liveLock,
    consensus: request.data?.consensus ?? null,
    analyses: request.data?.analyses ?? [],
    error: request.error?.message ?? request.data?.error ?? null,
    isValidating: request.isValidating,
    refresh: () => {
      void request.mutate()
      setRetryKey(key => key + 1)
    },
    retryKey,
    pollMs,
    nextPollAt: (request.data?.receivedAt ?? 0) + pollMs,
    timeframe,
    tfMs: TF_MS[timeframe],
  }
}

export type SignalState = ReturnType<typeof useSignals>
