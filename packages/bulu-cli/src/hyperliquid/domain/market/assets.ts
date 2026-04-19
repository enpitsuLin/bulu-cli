import type { AssetCtx, AssetMeta, HyperliquidMarketAsset, HyperliquidSpotMarketAsset, SpotMeta } from '../types'
import { normalizeSpotPair } from './spot'

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
