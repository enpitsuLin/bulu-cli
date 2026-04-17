import { postHyperliquidInfo } from './client'
import type {
  AssetCtx,
  AssetMeta,
  Candle,
  ClearinghouseState,
  HyperliquidMarketAsset,
  OpenOrder,
  SpotClearinghouseState,
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

export async function fetchOpenOrders(user: string, isTestnet?: boolean): Promise<OpenOrder[]> {
  return postHyperliquidInfo<OpenOrder[]>({ type: 'openOrders', user }, isTestnet)
}

export function resolveMarketPrice(context?: Pick<AssetCtx, 'markPx' | 'midPx' | 'oraclePx'>): string | undefined {
  return context?.markPx ?? context?.midPx ?? context?.oraclePx
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
