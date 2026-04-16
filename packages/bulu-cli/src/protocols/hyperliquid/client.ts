import { $fetch } from 'ofetch'
import { getHyperliquidApiUrl, getHyperliquidExchangeUrl } from '../../core/config'
import type {
  AssetCtx,
  AssetMeta,
  Candle,
  ClearinghouseState,
  OrderRequestBody,
  OrderResponse,
  SpotClearinghouseState,
} from './types'

export const VALID_PERIODS = ['1m', '5m', '15m', '1h', '4h', '1d'] as const

export type Period = (typeof VALID_PERIODS)[number]

function getApiUrl(): string {
  return getHyperliquidApiUrl()
}

export function resolvePeriodMs(period: string): number {
  switch (period) {
    case '1m':
      return 60 * 60 * 1000 * 2
    case '5m':
      return 60 * 60 * 1000 * 2
    case '15m':
      return 60 * 60 * 1000 * 2
    case '1h':
      return 60 * 60 * 1000 * 5
    case '4h':
      return 60 * 60 * 1000 * 12
    case '1d':
      return 60 * 60 * 1000 * 48
    default:
      return 60 * 60 * 1000 * 24
  }
}

export async function fetchMetaAndAssetCtxs(): Promise<{ universe: AssetMeta[]; contexts: AssetCtx[] }> {
  const data = await $fetch<[Record<string, unknown>, AssetCtx[]]>(getApiUrl(), {
    method: 'POST',
    body: { type: 'metaAndAssetCtxs' },
  })
  const universe = (data[0].universe ?? []) as AssetMeta[]
  return { universe, contexts: data[1] }
}

export async function fetchCandles(
  coin: string,
  interval: string,
  startTime: number,
  endTime: number,
): Promise<Candle[]> {
  return $fetch<Candle[]>(getApiUrl(), {
    method: 'POST',
    body: {
      type: 'candleSnapshot',
      req: { coin, interval, startTime, endTime },
    },
  })
}

export async function fetchClearinghouseState(user: string): Promise<ClearinghouseState> {
  return $fetch<ClearinghouseState>(getApiUrl(), {
    method: 'POST',
    body: { type: 'clearinghouseState', user },
  })
}

export async function fetchSpotClearinghouseState(user: string): Promise<SpotClearinghouseState> {
  return $fetch<SpotClearinghouseState>(getApiUrl(), {
    method: 'POST',
    body: { type: 'spotClearinghouseState', user },
  })
}

export async function resolveAssetIndex(coin: string): Promise<number> {
  const { universe } = await fetchMetaAndAssetCtxs()
  const index = universe.findIndex((u) => u.name === coin)
  if (index === -1) {
    throw new Error(`Coin "${coin}" not found on Hyperliquid`)
  }
  return index
}

export function splitSignature(signature: `0x${string}`): { r: `0x${string}`; s: `0x${string}`; v: number } {
  if (signature.length !== 132) {
    throw new Error(`Expected 65-byte signature (132 hex chars), got ${signature.length}`)
  }
  const r = `0x${signature.slice(2, 66)}` as `0x${string}`
  const s = `0x${signature.slice(66, 130)}` as `0x${string}`
  let v = parseInt(signature.slice(130, 132), 16)
  if (v === 0 || v === 1) v += 27
  if (v !== 27 && v !== 28) {
    throw new Error(`Invalid signature recovery value: ${v}, expected 27 or 28`)
  }
  return { r, s, v }
}

export async function submitExchangeRequest(body: OrderRequestBody): Promise<OrderResponse> {
  return $fetch<OrderResponse>(getHyperliquidExchangeUrl(), {
    method: 'POST',
    body,
  })
}
