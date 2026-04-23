import type { HyperliquidResolvedSpotMarket, HyperliquidSpotMarketLookup, HyperliquidSpotMeta } from './types'

export function buildSpotMarketLookup(meta: HyperliquidSpotMeta): HyperliquidSpotMarketLookup {
  const tokenByIndex = new Map(meta.tokens.map((token) => [token.index, token]))
  const byCanonical = new Map<string, HyperliquidResolvedSpotMarket>()
  const aliases = new Map<string, HyperliquidResolvedSpotMarket>()
  const markets = meta.universe.map((entry) => {
    const [baseIndex, quoteIndex] = entry.tokens
    const baseToken = tokenByIndex.get(baseIndex)
    const quoteToken = tokenByIndex.get(quoteIndex)

    if (!baseToken || !quoteToken) {
      throw new Error(`Spot market "${entry.name}" references unknown token indexes`)
    }

    const displayName = `${baseToken.name}/${quoteToken.name}`
    const market = {
      asset: 10000 + entry.index,
      canonicalName: entry.name,
      displayName,
      index: entry.index,
      isCanonical: entry.isCanonical,
      baseToken,
      quoteToken,
      szDecimals: baseToken.szDecimals,
    } satisfies HyperliquidResolvedSpotMarket

    byCanonical.set(entry.name.toUpperCase(), market)
    aliases.set(displayName.toUpperCase(), market)

    return market
  })

  return {
    markets,
    byCanonical,
    aliases,
  }
}

export function resolveSpotMarket(meta: HyperliquidSpotMeta, input: string): HyperliquidResolvedSpotMarket {
  const key = input.trim().toUpperCase()
  if (!key) {
    throw new Error('Spot market is required')
  }

  const lookup = buildSpotMarketLookup(meta)
  const market = lookup.aliases.get(key) ?? lookup.byCanonical.get(key)
  if (!market) {
    throw new Error(`Unknown Hyperliquid spot market "${input}"`)
  }

  return market
}

export function isSpotCoin(meta: HyperliquidSpotMeta, coin: string): boolean {
  return buildSpotMarketLookup(meta).byCanonical.has(coin.toUpperCase())
}

export function formatSpotCoin(meta: HyperliquidSpotMeta, coin: string): string {
  return buildSpotMarketLookup(meta).byCanonical.get(coin.toUpperCase())?.displayName ?? coin
}

export function toHyperliquidWireValue(value: string | number): string {
  const normalized = String(value).trim()
  if (!normalized) {
    throw new Error('Numeric value is required')
  }

  if (!/^-?(?:\d+|\d+\.\d+|\.\d+)$/.test(normalized)) {
    throw new Error(`Invalid numeric value "${value}"`)
  }

  if (normalized.startsWith('.')) {
    return toHyperliquidWireValue(`0${normalized}`)
  }

  if (normalized.startsWith('-.')) {
    return toHyperliquidWireValue(normalized.replace('-.', '-0.'))
  }

  const sign = normalized.startsWith('-') ? '-' : ''
  const unsigned = sign ? normalized.slice(1) : normalized
  const [rawIntegerPart, rawFractionPart = ''] = unsigned.split('.')
  const integerPart = rawIntegerPart.replace(/^0+(?=\d)/, '') || '0'
  const fractionPart = rawFractionPart.replace(/0+$/, '')

  if (integerPart === '0' && !fractionPart) {
    return '0'
  }

  return fractionPart ? `${sign}${integerPart}.${fractionPart}` : `${sign}${integerPart}`
}

export function buildMarketPriceFromMid(
  midPrice: string,
  isBuy: boolean,
  slippage: string | number,
  szDecimals: number,
): string {
  const mid = Number(midPrice)
  const slip = Number(slippage)

  if (!Number.isFinite(mid) || mid <= 0) {
    throw new Error(`Cannot derive market price from mid "${midPrice}"`)
  }

  if (!Number.isFinite(slip) || slip < 0) {
    throw new Error(`Invalid slippage value "${slippage}"`)
  }

  const adjusted = mid * (isBuy ? 1 + slip : 1 - slip)
  const roundedToPrecision = Number(adjusted.toPrecision(5))
  const decimals = Math.max(0, 8 - szDecimals)
  return toHyperliquidWireValue(roundedToPrecision.toFixed(decimals))
}
