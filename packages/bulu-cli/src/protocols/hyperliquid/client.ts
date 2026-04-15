import { $fetch } from 'ofetch'
import type { AssetCtx, AssetMeta, Candle } from './types'

export const VALID_PERIODS = ['1m', '5m', '15m', '1h', '4h', '1d'] as const

export type Period = (typeof VALID_PERIODS)[number]

const HYPERLIQUID_API = 'https://api.hyperliquid.xyz/info'

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
  const data = await $fetch<[Record<string, unknown>, AssetCtx[]]>(HYPERLIQUID_API, {
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
  return $fetch<Candle[]>(HYPERLIQUID_API, {
    method: 'POST',
    body: {
      type: 'candleSnapshot',
      req: { coin, interval, startTime, endTime },
    },
  })
}
