import { $fetch } from 'ofetch'
import { getHyperliquidApiUrl } from '../../core/config'
import type { AssetCtx, AssetMeta, Candle, ClearinghouseState, SpotClearinghouseState } from './types'

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
