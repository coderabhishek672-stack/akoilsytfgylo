'use client'

import { memo, useEffect, useMemo, useRef, useState } from 'react'
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts'
import { Activity, CandlestickChart, Download, Layers2, Maximize2, Minimize2, RotateCcw, Waves } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Panel, StatusDot } from './panel'
import { bollinger, ema, rollingVwap } from '@/lib/indicators'
import { TIMEFRAMES, TF_LABEL, formatPrice, type Candle, type SignalLock, type Timeframe, type TradeLevels } from '@/lib/market-types'
import { cn } from '@/lib/utils'

type Overlays = { ema: boolean; bands: boolean; vwap: boolean; volume: boolean }

export const PriceChart = memo(function PriceChart({
  candles,
  timeframe,
  onTimeframeChange,
  lock,
  previewLevels,
  live,
  tick,
  venue,
  error,
}: {
  candles: Candle[]
  timeframe: Timeframe
  onTimeframeChange: (timeframe: Timeframe) => void
  lock: SignalLock | null
  previewLevels: TradeLevels | null
  live: boolean
  tick: number
  venue: string
  error?: string | null
}) {
  const container = useRef<HTMLDivElement>(null)
  const chart = useRef<IChartApi | null>(null)
  const price = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volume = useRef<ISeriesApi<'Histogram'> | null>(null)
  const ema9 = useRef<ISeriesApi<'Line'> | null>(null)
  const ema21 = useRef<ISeriesApi<'Line'> | null>(null)
  const ema50 = useRef<ISeriesApi<'Line'> | null>(null)
  const ema200 = useRef<ISeriesApi<'Line'> | null>(null)
  const vwap = useRef<ISeriesApi<'Line'> | null>(null)
  const bbUpper = useRef<ISeriesApi<'Line'> | null>(null)
  const bbLower = useRef<ISeriesApi<'Line'> | null>(null)
  const lastTimeframe = useRef<Timeframe | null>(null)

  const [expanded, setExpanded] = useState(false)
  const [overlays, setOverlays] = useState<Overlays>({ ema: true, bands: false, vwap: true, volume: true })
  const [showLevels, setShowLevels] = useState(true)

  const last = candles.at(-1)
  const decimals = tick > 0 && tick < 1 ? Math.max(2, Math.ceil(-Math.log10(tick))) : 2

  useEffect(() => {
    if (!container.current) return
    const api = createChart(container.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#0b1119' },
        textColor: '#8490a2',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 10,
        attributionLogo: false,
      },
      grid: { vertLines: { color: '#161e2b' }, horzLines: { color: '#161e2b' } },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#657187', labelBackgroundColor: '#293243' },
        horzLine: { color: '#657187', labelBackgroundColor: '#293243' },
      },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.26 }, minimumWidth: 78 },
      timeScale: { borderColor: '#202937', timeVisible: true, secondsVisible: false, rightOffset: 8, barSpacing: 7 },
      handleScale: true,
      handleScroll: true,
    })
    chart.current = api
    price.current = api.addSeries(CandlestickSeries, {
      upColor: '#36cba2',
      downColor: '#f27483',
      borderVisible: false,
      wickUpColor: '#36cba2',
      wickDownColor: '#f27483',
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    })
    volume.current = api.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'volume', lastValueVisible: false, priceLineVisible: false })
    volume.current.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, borderVisible: false })
    bbUpper.current = api.addSeries(LineSeries, { color: '#8f9cc7', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
    bbLower.current = api.addSeries(LineSeries, { color: '#8f9cc7', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
    ema200.current = api.addSeries(LineSeries, { color: '#6b7688', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
    ema50.current = api.addSeries(LineSeries, { color: '#8f9cc7', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
    ema21.current = api.addSeries(LineSeries, { color: '#d8b66d', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
    ema9.current = api.addSeries(LineSeries, { color: '#36cba2', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
    vwap.current = api.addSeries(LineSeries, { color: '#c58af9', lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })

    return () => {
      api.remove()
      chart.current = null
      price.current = null
      volume.current = null
      ema9.current = null
      ema21.current = null
      ema50.current = null
      ema200.current = null
      vwap.current = null
      bbUpper.current = null
      bbLower.current = null
      lastTimeframe.current = null
    }
  }, [])

  const series = useMemo(() => {
    if (!candles.length) return null
    const closes = candles.map(candle => candle.close)
    return {
      closes,
      ema9: ema(closes, 9),
      ema21: ema(closes, 21),
      ema50: ema(closes, 50),
      ema200: ema(closes, 200),
      bands: bollinger(closes, 20, 2),
      vwap: candles.map((_, index) => rollingVwap(candles.slice(Math.max(0, index - 49), index + 1), 50)),
    }
  }, [candles])

  useEffect(() => {
    if (!candles.length || !price.current || !series) return
    const stamp = (time: number) => time / 1000 as UTCTimestamp
    price.current.setData(candles.map(candle => ({ time: stamp(candle.time), open: candle.open, high: candle.high, low: candle.low, close: candle.close })))
    volume.current?.setData(candles.map(candle => ({ time: stamp(candle.time), value: candle.volume, color: candle.close >= candle.open ? '#36cba22e' : '#f274832e' })))

    const line = (values: number[], offset = 0) =>
      values
        .map((value, index) => ({ time: stamp(candles[index].time), value }))
        .slice(offset)
        .filter(point => Number.isFinite(point.value))

    ema9.current?.setData(line(series.ema9, 0))
    ema21.current?.setData(line(series.ema21, 0))
    ema50.current?.setData(line(series.ema50, 0))
    ema200.current?.setData(line(series.ema200, 0))
    vwap.current?.setData(line(series.vwap, 0))
    const bandUpper = series.bands.upper.map((value, index) => ({ time: stamp(candles[index + 19].time), value }))
    const bandLower = series.bands.lower.map((value, index) => ({ time: stamp(candles[index + 19].time), value }))
    bbUpper.current?.setData(bandUpper)
    bbLower.current?.setData(bandLower)

    if (lastTimeframe.current !== timeframe) {
      chart.current?.timeScale().setVisibleLogicalRange({ from: Math.max(0, candles.length - 120), to: candles.length + 8 })
      lastTimeframe.current = timeframe
    }
  }, [candles, series, timeframe])

  useEffect(() => {
    ema9.current?.applyOptions({ visible: overlays.ema })
    ema21.current?.applyOptions({ visible: overlays.ema })
    ema50.current?.applyOptions({ visible: overlays.ema })
    ema200.current?.applyOptions({ visible: overlays.ema })
    vwap.current?.applyOptions({ visible: overlays.vwap })
    bbUpper.current?.applyOptions({ visible: overlays.bands })
    bbLower.current?.applyOptions({ visible: overlays.bands })
    volume.current?.applyOptions({ visible: overlays.volume })
  }, [overlays])

  useEffect(() => {
    if (tick > 0) {
      price.current?.applyOptions({ priceFormat: { type: 'price', precision: decimals, minMove: tick } })
    }
  }, [tick, decimals])

  useEffect(() => {
    const series = price.current
    if (!series || !showLevels) return
    const frozen = lock?.levels ?? null
    const preview = frozen ? null : previewLevels
    const levels = frozen ?? preview
    if (!levels) return

    const suffix = frozen ? '' : ' (preview)'
    const alpha = frozen ? '' : '80'
    const lines = [
      series.createPriceLine({ price: levels.idealEntry, color: `#dfbb70${alpha}`, title: `IDEAL ENTRY${suffix}`, lineWidth: frozen ? 2 : 1, lineStyle: frozen ? LineStyle.Solid : LineStyle.Dashed, axisLabelVisible: true }),
      series.createPriceLine({ price: levels.stopLoss, color: `#f27483${alpha}`, title: `STOP${suffix}`, lineWidth: frozen ? 2 : 1, lineStyle: frozen ? LineStyle.Solid : LineStyle.Dashed, axisLabelVisible: true }),
      ...levels.targets.map((target, index) =>
        series.createPriceLine({
          price: target,
          color: `#36cba2${alpha}`,
          title: `TP${index + 1} (${index + 1}R)${suffix}`,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
        }),
      ),
      series.createPriceLine({ price: levels.zoneLow, color: `#dfbb7055`, title: '', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false }),
      series.createPriceLine({ price: levels.zoneHigh, color: `#dfbb7055`, title: '', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false }),
    ]

    return () => {
      if (price.current === series) lines.forEach(line => series.removePriceLine(line))
    }
  }, [lock, previewLevels, showLevels])

  useEffect(() => {
    if (!expanded) return
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false)
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [expanded])

  const download = () => {
    const canvas = chart.current?.takeScreenshot()
    if (!canvas) return
    const anchor = document.createElement('a')
    anchor.download = `XAUUSDT-${timeframe}-${Date.now()}.png`
    anchor.href = canvas.toDataURL('image/png')
    anchor.click()
  }

  const toggle = (key: keyof Overlays) => setOverlays(previous => ({ ...previous, [key]: !previous[key] }))

  return (
    <Panel
      title="Price action"
      icon={<CandlestickChart className="size-3.5" />}
      className={cn('chart-panel', expanded && 'chart-expanded')}
      action={
        <div className="flex items-center gap-2 text-[10px] font-normal tracking-normal normal-case">
          <StatusDot live={live} />
          <span className="text-muted-foreground">{venue} · XAUUSDT perp</span>
          <Button size="icon-xs" variant="ghost" onClick={() => setExpanded(value => !value)} aria-label={expanded ? 'Collapse chart' : 'Expand chart'}>
            {expanded ? <Minimize2 /> : <Maximize2 />}
          </Button>
        </div>
      }
    >
      <div className="chart-toolbar">
        <div className="flex items-center gap-0.5" aria-label="Chart timeframe">
          {TIMEFRAMES.map(tf => (
            <Button
              key={tf}
              size="xs"
              variant="ghost"
              aria-pressed={timeframe === tf}
              title={TF_LABEL[tf]}
              onClick={() => onTimeframeChange(tf)}
              className={cn('h-7 rounded px-2 font-mono text-[11px]', timeframe === tf ? 'bg-primary/15 text-primary hover:bg-primary/25' : 'text-muted-foreground')}
            >
              {tf.toUpperCase()}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-0.5 border-l border-border pl-2">
          <Button size="xs" variant="ghost" aria-pressed={overlays.ema} onClick={() => toggle('ema')} className={cn('text-[10px]', overlays.ema ? 'text-primary' : 'text-muted-foreground')}>
            <Activity />EMA
          </Button>
          <Button size="xs" variant="ghost" aria-pressed={overlays.bands} onClick={() => toggle('bands')} className={cn('text-[10px]', overlays.bands ? 'text-primary' : 'text-muted-foreground')}>
            <Waves />BB
          </Button>
          <Button size="xs" variant="ghost" aria-pressed={overlays.vwap} onClick={() => toggle('vwap')} className={cn('text-[10px]', overlays.vwap ? 'text-primary' : 'text-muted-foreground')}>
            VWAP
          </Button>
          <Button size="icon-xs" variant="ghost" aria-label="Toggle signal levels" aria-pressed={showLevels} onClick={() => setShowLevels(value => !value)} className={showLevels ? 'text-primary' : 'text-muted-foreground'}>
            <Layers2 />
          </Button>
        </div>
        <div className="ml-auto flex">
          <Button size="icon-xs" variant="ghost" aria-label="Reset zoom" onClick={() => chart.current?.timeScale().setVisibleLogicalRange({ from: Math.max(0, candles.length - 120), to: candles.length + 8 })}>
            <RotateCcw />
          </Button>
          <Button size="icon-xs" variant="ghost" aria-label="Download chart image" onClick={download} disabled={!candles.length}>
            <Download />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-2.5 font-mono text-[10px]">
        <span className="font-medium text-foreground">
          XAU/USDT <span className="text-muted-foreground">· {timeframe.toUpperCase()} · {venue}</span>
        </span>
        {([['O', last?.open], ['H', last?.high], ['L', last?.low], ['C', last?.close]] as const).map(([label, value]) => (
          <span key={label} className="text-muted-foreground">
            {label} <span className={cn(last && last.close >= last.open ? 'text-positive' : 'text-negative')}>{formatPrice(value as number | undefined, decimals)}</span>
          </span>
        ))}
        {last && <span className="text-muted-foreground">VOL <span className="text-foreground">{formatPrice(last.volume, 1)}</span></span>}
      </div>

      <div className="relative min-h-0 flex-1">
        <div ref={container} className="absolute inset-0" role="img" aria-label={`Live ${venue} XAU USDT ${timeframe} candlestick chart with EMA, Bollinger, VWAP and volume`} />
        {!candles.length && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-card">
            <span className="text-xs text-muted-foreground">{error ? 'Candle feed unavailable. Retrying…' : 'Connecting to verified XAU market data…'}</span>
            <span className="text-[10px] text-muted-foreground">No synthetic candles. No substituted assets.</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2 text-[10px]">
        <div className="flex flex-wrap gap-3.5 text-muted-foreground">
          <span className="flex items-center gap-1.5"><i className="h-px w-3 bg-positive" />EMA 9</span>
          <span className="flex items-center gap-1.5"><i className="h-px w-3 bg-primary" />EMA 21</span>
          <span className="flex items-center gap-1.5"><i className="h-px w-3 bg-chart-3" />EMA 50</span>
          <span className="flex items-center gap-1.5"><i className="h-px w-3 bg-[#6b7688]" />EMA 200</span>
          <span className="flex items-center gap-1.5"><i className="h-px w-3 bg-[#c58af9]" />VWAP 50</span>
          {overlays.bands && <span className="flex items-center gap-1.5"><i className="h-px w-3 bg-chart-3" />Bollinger 20 · 2σ</span>}
        </div>
        <span className="text-muted-foreground">
          {lock ? 'Frozen lock levels' : previewLevels ? 'Dashed = preview levels, not locked' : 'TradingView Lightweight Charts™'}
        </span>
      </div>
    </Panel>
  )
})
