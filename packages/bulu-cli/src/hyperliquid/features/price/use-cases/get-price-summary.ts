import { findMarketAsset } from '../../../domain/market/assets'
import { type Period, isValidPeriod, resolvePeriodMs, VALID_PERIODS } from '../../../domain/market/periods'
import { resolveMarketPrice } from '../../../domain/market/pricing'
import type { Candle } from '../../../domain/types'
import { fetchCandles, fetchMetaAndAssetCtxs } from '../../../gateway/info'
import { wrapAsync, wrapSync } from '../../../shared/errors'

export interface PricePeriodSummary extends Record<string, unknown> {
  period: string
  change: string
  high: string
  low: string
  volume: string
}

export interface PriceSummary {
  pair: string
  price: string
  mark: string
  oracle: string
  periods: PricePeriodSummary[]
}

interface PriceDeps {
  fetchCandles: typeof fetchCandles
  fetchMetaAndAssetCtxs: typeof fetchMetaAndAssetCtxs
}

const defaultDeps: PriceDeps = {
  fetchCandles,
  fetchMetaAndAssetCtxs,
}

function formatChange(current: number, prev: number): string {
  if (!Number.isFinite(prev) || prev === 0) return 'N/A'
  const change = ((current - prev) / prev) * 100
  const sign = change >= 0 ? '+' : ''
  return `${sign}${change.toFixed(2)}%`
}

async function fetchPeriodSummary(
  pair: string,
  period: Period,
  price: number,
  testnet: boolean,
  deps: PriceDeps,
): Promise<PricePeriodSummary | null> {
  const ms = resolvePeriodMs(period)
  const now = Date.now()
  const startTime = now - ms
  let candles: Candle[] = []
  try {
    candles = await deps.fetchCandles(pair, period, startTime, now, testnet)
  } catch {
    return null
  }

  const candle = candles.at(-1)
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

export async function getPriceSummary(
  input: { pair?: string; period?: string; testnet?: boolean },
  deps: PriceDeps = defaultDeps,
): Promise<PriceSummary> {
  const pair = String(input.pair).toUpperCase()
  const period = input.period ? String(input.period).toLowerCase() : undefined
  const testnet = input.testnet === true

  if (period && !isValidPeriod(period)) {
    throw new Error(`Invalid period "${period}". Valid options: ${VALID_PERIODS.join(', ')}`)
  }

  const requestedPeriod: Period | undefined = period && isValidPeriod(period) ? period : undefined
  const marketData = await wrapAsync(deps.fetchMetaAndAssetCtxs(testnet), 'Failed to fetch market data')
  const market = wrapSync(() => findMarketAsset(pair, marketData), 'Failed to fetch market data')
  const ctx = market.context
  const priceStr = resolveMarketPrice(ctx) ?? 'N/A'
  const markStr = ctx?.markPx ?? 'N/A'
  const oracleStr = ctx?.oraclePx ?? 'N/A'
  const price = parseFloat(priceStr)
  const periods: Period[] = requestedPeriod ? [requestedPeriod] : ['1h', '4h', '1d']

  const rows = (
    await Promise.all(periods.map((candidate) => fetchPeriodSummary(pair, candidate, price, testnet, deps)))
  ).filter((row): row is PricePeriodSummary => row !== null)

  if (rows.length === 0) {
    throw new Error(`No candle data available for ${pair}`)
  }

  return {
    pair,
    price: priceStr,
    mark: markStr,
    oracle: oracleStr,
    periods: rows,
  }
}
