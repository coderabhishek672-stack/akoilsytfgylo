'use client'

import { Crosshair, ExternalLink, Gauge, LockKeyhole, ShieldCheck, Target, Waves } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { formatPrice } from '@/lib/market-types'

const SECTIONS = [
  {
    icon: Waves,
    title: '01 · Data comes from the exchange, never from a model',
    body: 'The primary feed is the Binance USDⓈ-M XAUUSDT perpetual, one troy ounce of gold quoted in USDT. Quotes, order book, trades, funding and open interest stream from the exchange WebSocket and REST API. Some hosting regions cannot reach the Binance REST host, so the server walks an ordered list of Binance hosts and, only if every one is blocked, falls back to the OKX XAU-USDT perpetual. The venue badge always names the live source. Nothing is simulated, interpolated or substituted with a tokenised-gold proxy.',
  },
  {
    icon: Gauge,
    title: '02 · Ten weighted factors score every timeframe',
    body: 'For each of 1m, 3m, 5m, 15m, 30m, 1h and 3h the engine computes EMA 9/21/50/200, Wilder RSI 14, Wilder ATR 14, MACD 12/26/9, rolling 50-bar VWAP, Bollinger Bands 20/2, Stochastic 14/3, ADX 14 with +DI/−DI, Supertrend ATR 10 × 3, a 20-bar swing-structure read, and relative volume. Each factor votes with a fixed weight. The weighted vote is a signed score from −100 to +100. Only closed candles are scored, so a forming candle can never change a direction.',
  },
  {
    icon: Crosshair,
    title: '03 · Signal Lock freezes a decision',
    body: 'A direction arms when the timeframe score reaches ±50 and stays there for two consecutive closed candles. It only locks when all six gates pass: score ±60 or better, weighted multi-timeframe agreement of at least 62%, ADX 18 or higher, market structure that is not opposing, volume at 0.75× its average or better, and at least three of the seven timeframes aligned. The moment a lock is taken, direction, entry, stop and targets are frozen for a fixed number of bars and are never redrawn. While a timeframe is still arming, the panel shows a dashed preview of the levels that would be locked — clearly labelled as preview, because those levels can still shift. The live price can only move a committed plan through Triggered, Target reached, Invalidated or Expired.',
  },
  {
    icon: Target,
    title: '04 · How the levels are calculated',
    body: 'The ideal entry is the nearest confluence of value anchors — EMA 21, VWAP, Bollinger middle and EMA 50 — on the retracement side of price, snapped onto the venue price tick. The stop is the wider of the 20-bar swing boundary plus a 0.35 ATR buffer and 1.6 ATR from entry, capped at 2.6 ATR so a scalp never carries an oversized risk. Targets sit at 1R, 2R and 3R from the locked entry. Every level is rounded to an orderable tick for the venue that is live. If the contract unit is not one ounce, position sizes are converted with the venue contract size.',
  },
  {
    icon: LockKeyhole,
    title: '05 · The multi-timeframe switch',
    body: 'Each timeframe keeps its own independent lock, its own gate panel and its own history. Switching timeframes never changes another timeframe’s plan. The confluence ladder shows how every timeframe currently votes and whether it agrees with the lock you are looking at, weighted so that slower timeframes count for more. The consensus strip aggregates all seven into a single bias.',
  },
  {
    icon: ShieldCheck,
    title: '06 · What the numbers do not mean',
    body: 'Confidence is weighted agreement between indicators and timeframes. It is not a calibrated probability and no win rate is claimed. There is no guaranteed entry, no 100% certainty and no fixed accuracy — a high-confidence lock can still lose. Signal Lock removes intrabar flicker and moving levels; it cannot remove market risk. Fees, funding, slippage and gaps can all worsen a real outcome, and touching a target does not prove that an order filled. This terminal does not place trades and is not financial advice.',
  },
]

export function MethodologyDialog({ open, onOpenChange, venue, tick }: { open: boolean; onOpenChange: (open: boolean) => void; venue: string; tick?: string }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85svh] overflow-y-auto border border-border bg-card p-6 sm:max-w-2xl">
        <DialogHeader>
          <span className="eyebrow">TRANSPARENT BY DESIGN</span>
          <DialogTitle className="mt-2 text-2xl">A disciplined lock. Not a promise.</DialogTitle>
          <DialogDescription className="mt-1 text-xs leading-relaxed">
            Deterministic calculations remove intrabar flicker and moving levels. They cannot remove market uncertainty or guarantee profit.
          </DialogDescription>
        </DialogHeader>

        <Alert className="my-1 border-primary/25 bg-primary/5 p-3">
          <ShieldCheck className="text-primary" />
          <AlertTitle className="text-xs text-primary">Precision is not prediction accuracy</AlertTitle>
          <AlertDescription className="mt-1 text-xs leading-relaxed">
            Live venue: <span className="font-mono text-foreground">{venue}</span>
            {tick ? <> · price tick <span className="font-mono text-foreground">{tick} USDT</span></> : null}. Prices are snapped to that tick, so a level is always orderable.
            No measured win rate, calibrated probability or guaranteed accuracy is claimed, and this strategy has not been independently validated.
          </AlertDescription>
        </Alert>

        <div className="space-y-4 text-xs leading-relaxed text-muted-foreground">
          {SECTIONS.map(section => (
            <section key={section.title}>
              <h3 className="mb-1.5 flex items-center gap-2 font-medium text-foreground">
                <section.icon className="size-4 text-primary" />
                {section.title}
              </h3>
              <p>{section.body}</p>
            </section>
          ))}

          <section>
            <h3 className="mb-1.5 font-medium text-foreground">Reference</h3>
            <div className="flex flex-wrap gap-4">
              <a href="https://developers.binance.com/docs/derivatives/usds-margined-futures/general-info" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                Binance USDⓈ-M futures API<ExternalLink className="size-3" />
              </a>
              <a href="https://www.okx.com/docs-v5/en/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                OKX v5 API (fallback venue)<ExternalLink className="size-3" />
              </a>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
