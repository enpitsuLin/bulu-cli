import { postHyperliquidInfo } from './client'
import type {
  AssetCtx,
  AssetMeta,
  Candle,
  ClearinghouseState,
  FrontendOpenOrder,
  HistoricalOrder,
  HyperliquidMarketAsset,
  HyperliquidSpotMarketAsset,
  OpenOrder,
  OrderStatusInfo,
  SpotMeta,
  SpotClearinghouseState,
  UserFill,
} from './types'

export const VALID_PERIODS = ['1m', '5m', '15m', '1h', '4h', '1d'] as const

export type Period = (typeof VALID_PERIODS)[number]

const PERIOD_LOOKBACK_MS: Record<Period, number> = {
  '1m': 60 * 60 * 1000 * 2,
  '5m': 60 * 60 * 1000 * 2,
  '15m': 60 * 60 * 1000 * 2,
  '1h': 60 * 60 * 1000 * 5,
  '4h': 60 * 60 * 1000 * 12,
  '1d': 60 * 60 * 1000 * 48,
}

interface MetaResponse {
  universe?: AssetMeta[]
}

type MetaAndAssetCtxsResponse = [MetaResponse, AssetCtx[]]
type SpotMetaAndAssetCtxsResponse = [SpotMeta, AssetCtx[]]

export function isValidPeriod(period: string): period is Period {
  return VALID_PERIODS.includes(period as Period)
}

export function resolvePeriodMs(period: string): number {
  return isValidPeriod(period) ? PERIOD_LOOKBACK_MS[period] : 60 * 60 * 1000 * 24
}

export async function fetchMetaAndAssetCtxs(
  isTestnet?: boolean,
): Promise<{ universe: AssetMeta[]; contexts: AssetCtx[] }> {
  const data = await postHyperliquidInfo<MetaAndAssetCtxsResponse>({ type: 'metaAndAssetCtxs' }, isTestnet)
  return {
    universe: data[0]?.universe ?? [],
    contexts: data[1] ?? [],
  }
}

export async function fetchCandles(
  coin: string,
  interval: string,
  startTime: number,
  endTime: number,
  isTestnet?: boolean,
): Promise<Candle[]> {
  return postHyperliquidInfo<Candle[]>(
    {
      type: 'candleSnapshot',
      req: { coin, interval, startTime, endTime },
    },
    isTestnet,
  )
}

export async function fetchClearinghouseState(user: string, isTestnet?: boolean): Promise<ClearinghouseState> {
  return postHyperliquidInfo<ClearinghouseState>({ type: 'clearinghouseState', user }, isTestnet)
}

export async function fetchSpotClearinghouseState(user: string, isTestnet?: boolean): Promise<SpotClearinghouseState> {
  return postHyperliquidInfo<SpotClearinghouseState>({ type: 'spotClearinghouseState', user }, isTestnet)
}

export async function fetchSpotMeta(isTestnet?: boolean): Promise<SpotMeta> {
  const data = await postHyperliquidInfo<SpotMeta>({ type: 'spotMeta' }, isTestnet)
  return {
    tokens: data.tokens ?? [],
    universe: data.universe ?? [],
  }
}

export async function fetchSpotMetaAndAssetCtxs(
  isTestnet?: boolean,
): Promise<{ meta: SpotMeta; contexts: AssetCtx[] }> {
  const data = await postHyperliquidInfo<SpotMetaAndAssetCtxsResponse>({ type: 'spotMetaAndAssetCtxs' }, isTestnet)
  return {
    meta: {
      tokens: data[0]?.tokens ?? [],
      universe: data[0]?.universe ?? [],
    },
    contexts: data[1] ?? [],
  }
}

export async function fetchOpenOrders(user: string, isTestnet?: boolean): Promise<OpenOrder[]> {
  return postHyperliquidInfo<OpenOrder[]>({ type: 'openOrders', user }, isTestnet)
}

export async function fetchFrontendOpenOrders(user: string, isTestnet?: boolean): Promise<FrontendOpenOrder[]> {
  return postHyperliquidInfo<FrontendOpenOrder[]>({ type: 'frontendOpenOrders', user }, isTestnet)
}

export async function fetchUserFills(user: string, aggregateByTime = false, isTestnet?: boolean): Promise<UserFill[]> {
  return postHyperliquidInfo<UserFill[]>({ type: 'userFills', user, aggregateByTime }, isTestnet)
}

export async function fetchUserFillsByTime(args: {
  user: string
  startTime: number
  endTime?: number
  aggregateByTime?: boolean
  isTestnet?: boolean
}): Promise<UserFill[]> {
  const { user, startTime, endTime, aggregateByTime = false, isTestnet } = args
  return postHyperliquidInfo<UserFill[]>(
    {
      type: 'userFillsByTime',
      user,
      startTime,
      endTime,
      aggregateByTime,
    },
    isTestnet,
  )
}

export async function fetchOrderStatus(args: {
  user: string
  oid: number | string
  isTestnet?: boolean
}): Promise<OrderStatusInfo> {
  const { user, oid, isTestnet } = args
  return postHyperliquidInfo<OrderStatusInfo>({ type: 'orderStatus', user, oid }, isTestnet)
}

export async function fetchHistoricalOrders(user: string, isTestnet?: boolean): Promise<HistoricalOrder[]> {
  return postHyperliquidInfo<HistoricalOrder[]>({ type: 'historicalOrders', user }, isTestnet)
}

export function resolveMarketPrice(context?: Pick<AssetCtx, 'markPx' | 'midPx' | 'oraclePx'>): string | undefined {
  return context?.markPx ?? context?.midPx ?? context?.oraclePx
}

export function normalizeSpotPair(pair: string): string {
  const trimmed = pair.trim()
  if (!trimmed) {
    throw new Error('Spot pair is required')
  }

  if (trimmed.startsWith('@') || trimmed.startsWith('#')) {
    return trimmed
  }

  return trimmed.toUpperCase()
}

export function buildSpotPairNameSet(spotMeta: Pick<SpotMeta, 'universe'>): Set<string> {
  return new Set(spotMeta.universe.map((pair) => normalizeSpotPair(pair.name)))
}

export function isSpotPairName(coin: string, spotMeta: Pick<SpotMeta, 'universe'> | Set<string>): boolean {
  const spotPairs = spotMeta instanceof Set ? spotMeta : buildSpotPairNameSet(spotMeta)
  return spotPairs.has(normalizeSpotPair(coin))
}

export function partitionEntriesBySpot<T extends { coin: string }>(
  entries: T[],
  spotMeta: Pick<SpotMeta, 'universe'> | Set<string>,
): { spot: T[]; perps: T[] } {
  const spotPairs = spotMeta instanceof Set ? spotMeta : buildSpotPairNameSet(spotMeta)
  const spot: T[] = []
  const perps: T[] = []

  for (const entry of entries) {
    if (spotPairs.has(normalizeSpotPair(entry.coin))) {
      spot.push(entry)
    } else {
      perps.push(entry)
    }
  }

  return { spot, perps }
}

export function findMarketAsset(
  coin: string,
  market: { universe: AssetMeta[]; contexts: AssetCtx[] },
): HyperliquidMarketAsset {
  const normalizedCoin = coin.toUpperCase()
  const assetIndex = market.universe.findIndex((asset) => asset.name === normalizedCoin)
  if (assetIndex === -1) {
    throw new Error(`Coin "${normalizedCoin}" not found on Hyperliquid`)
  }

  return {
    assetIndex,
    meta: market.universe[assetIndex],
    context: market.contexts[assetIndex],
  }
}

export async function fetchMarketAsset(coin: string, isTestnet?: boolean): Promise<HyperliquidMarketAsset> {
  const market = await fetchMetaAndAssetCtxs(isTestnet)
  return findMarketAsset(coin, market)
}

export function findSpotMarketAsset(
  pair: string,
  spotMarket: { meta: SpotMeta; contexts: AssetCtx[] },
): HyperliquidSpotMarketAsset {
  const normalizedPair = normalizeSpotPair(pair)
  const pairIndex = spotMarket.meta.universe.findIndex((asset) => normalizeSpotPair(asset.name) === normalizedPair)
  if (pairIndex === -1) {
    throw new Error(`Spot pair "${normalizedPair}" not found on Hyperliquid`)
  }

  const meta = spotMarket.meta.universe[pairIndex]
  const tokenByIndex = new Map(spotMarket.meta.tokens.map((token) => [token.index, token]))
  const [baseIndex, quoteIndex] = meta.tokens
  const baseToken = tokenByIndex.get(baseIndex)
  const quoteToken = tokenByIndex.get(quoteIndex)

  if (!baseToken || !quoteToken) {
    throw new Error(`Spot pair "${meta.name}" references unknown token metadata`)
  }

  return {
    assetIndex: 10_000 + meta.index,
    meta,
    context: spotMarket.contexts[pairIndex],
    baseToken,
    quoteToken,
  }
}

export async function fetchSpotMarketAsset(pair: string, isTestnet?: boolean): Promise<HyperliquidSpotMarketAsset> {
  const spotMarket = await fetchSpotMetaAndAssetCtxs(isTestnet)
  return findSpotMarketAsset(pair, spotMarket)
}
