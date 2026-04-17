import { defineCommand } from 'citty'
import { createOutput, resolveOutputOptions } from '../../core/output'
import { withDefaultArgs } from '../../core/args-def'
import { fetchCandles, fetchMetaAndAssetCtxs, resolvePeriodMs, VALID_PERIODS } from '../../protocols/hyperliquid'

function formatChange(current: number, prev: number): string {
  if (!Number.isFinite(prev) || prev === 0) return 'N/A'
  const change = ((current - prev) / prev) * 100
  const sign = change >= 0 ? '+' : ''
  return `${sign}${change.toFixed(2)}%`
}

async function fetchPeriodRow(
  pair: string,
  period: string,
  price: number,
): Promise<Record<string, string | number> | null> {
  const ms = resolvePeriodMs(period)
  const now = Date.now()
  const startTime = now - ms
  let candles: { o: string; c: string; h: string; l: string; v: string }[] = []
  try {
    candles = await fetchCandles(pair, period, startTime, now)
  } catch {
    return null
  }

  const candle = candles.length > 0 ? candles[candles.length - 1] : null
  if (!candle) return null

  const open = parseFloat(candle.o)
  const change = Number.isFinite(price) && Number.isFinite(open) && open !== 0 ? formatChange(price, open) : 'N/A'

  return {
    period: period.toUpperCase(),
    change,
    high: candle.h,
    low: candle.l,
    volume: candle.v,
  }
}

export default defineCommand({
  meta: { name: 'price', description: 'Get Hyperliquid price for a trading pair' },
  args: withDefaultArgs({
    pair: {
      type: 'positional',
      description: 'Trading pair symbol, e.g. BTC, ETH, SOL',
      required: true,
    },
    period: {
      type: 'string',
      description: 'Candle period: 1m, 5m, 15m, 1h, 4h, 1d',
      alias: 'p',
    },
  }),
  async run({ args }) {
    const pair = String(args.pair).toUpperCase()
    const period = args.period ? String(args.period).toLowerCase() : undefined
    const out = createOutput(resolveOutputOptions(args))

    if (period && !VALID_PERIODS.includes(period as (typeof VALID_PERIODS)[number])) {
      out.warn(`Invalid period "${period}". Valid options: ${VALID_PERIODS.join(', ')}`)
      process.exit(1)
    }

    let meta: {
      universe: { name: string }[]
      contexts: {
        markPx?: string
        midPx?: string
        oraclePx?: string
        prevDayPx?: string
      }[]
    }
    try {
      meta = await fetchMetaAndAssetCtxs()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      out.warn(`Failed to fetch market data: ${message}`)
      process.exit(1)
    }

    const index = meta.universe.findIndex((u) => u.name === pair)
    if (index === -1) {
      out.warn(`Pair "${pair}" not found on Hyperliquid`)
      process.exit(1)
    }

    const ctx = meta.contexts[index]
    const priceStr = ctx.markPx ?? ctx.midPx ?? ctx.oraclePx ?? 'N/A'
    const markStr = ctx.markPx ?? 'N/A'
    const oracleStr = ctx.oraclePx ?? 'N/A'
    const price = parseFloat(priceStr)

    const periods = period ? [period] : ['1h', '4h', '1d']
    const rows = (await Promise.all(periods.map((p) => fetchPeriodRow(pair, p, price)))).filter(
      (r): r is Record<string, string | number> => r !== null,
    )

    if (rows.length === 0) {
      out.warn(`No candle data available for ${pair}`)
      process.exit(1)
    }

    const isJson = args.json || args.format === 'json'
    const isCsv = args.format === 'csv'

    if (isJson) {
      out.data({
        pair,
        price: priceStr,
        mark: markStr,
        oracle: oracleStr,
        periods: rows,
      })
      return
    }

    if (isCsv) {
      const header = `pair,price,mark,oracle,period,change,high,low,volume`
      out.data(header)
      for (const row of rows) {
        const line = `${pair},${priceStr},${markStr},${oracleStr},${row.period},${row.change},${row.high},${row.low},${row.volume}`
        out.data(line)
      }
      return
    }

    out.table(rows, {
      columns: ['period', 'change', 'high', 'low', 'volume'],
      title: `${pair} on Hyperliquid | Price: ${priceStr} | Mark: ${markStr} | Oracle: ${oracleStr}`,
    })
  },
})
