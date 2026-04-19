import type { AssetCtx } from '../types'

export function resolveMarketPrice(context?: Pick<AssetCtx, 'markPx' | 'midPx' | 'oraclePx'>): string | undefined {
  return context?.markPx ?? context?.midPx ?? context?.oraclePx
}
