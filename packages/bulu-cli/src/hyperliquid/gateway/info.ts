import type {
  AssetCtx,
  AssetMeta,
  Candle,
  ClearinghouseState,
  FrontendOpenOrder,
  HistoricalOrder,
  OpenOrder,
  OrderStatusInfo,
  SpotMeta,
  SpotClearinghouseState,
  UserFill,
} from '../domain/types'
import { postHyperliquidInfo } from './client'

interface MetaResponse {
  universe?: AssetMeta[]
}

type MetaAndAssetCtxsResponse = [MetaResponse, AssetCtx[]]
type SpotMetaAndAssetCtxsResponse = [SpotMeta, AssetCtx[]]

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
