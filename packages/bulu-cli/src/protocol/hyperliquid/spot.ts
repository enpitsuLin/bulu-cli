import type { HyperliquidResolvedSpotMarket, HyperliquidSpotMarketLookup, HyperliquidSpotMeta } from './types'

const lookupCache = new WeakMap<HyperliquidSpotMeta, HyperliquidSpotMarketLookup>()

export function buildSpotMarketLookup(meta: HyperliquidSpotMeta): HyperliquidSpotMarketLookup {
  const cached = lookupCache.get(meta)
  if (cached) {
    return cached
  }

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

  const lookup = {
    markets,
    byCanonical,
    aliases,
  }

  lookupCache.set(meta, lookup)
  return lookup
}

type SpotMarketSource = HyperliquidSpotMeta | HyperliquidSpotMarketLookup

function getSpotMarketLookup(source: SpotMarketSource): HyperliquidSpotMarketLookup {
  return 'byCanonical' in source ? source : buildSpotMarketLookup(source)
}

export function resolveSpotMarket(source: SpotMarketSource, input: string): HyperliquidResolvedSpotMarket {
  const key = input.trim().toUpperCase()
  if (!key) {
    throw new Error('Spot market is required')
  }

  const lookup = getSpotMarketLookup(source)
  const market = lookup.aliases.get(key) ?? lookup.byCanonical.get(key)
  if (!market) {
    const suggestions = lookup.markets
      .slice(0, 8)
      .map((m) => m.displayName)
      .join(', ')
    throw new Error(`Unknown Hyperliquid spot market "${input}". Available markets include: ${suggestions}...`)
  }

  return market
}

export function isSpotCoin(source: SpotMarketSource, coin: string): boolean {
  return getSpotMarketLookup(source).byCanonical.has(coin.trim().toUpperCase())
}

export function formatSpotCoin(source: SpotMarketSource, coin: string): string {
  return getSpotMarketLookup(source).byCanonical.get(coin.trim().toUpperCase())?.displayName ?? coin
}

export function toHyperliquidWireValue(value: string | number): string {
  const normalized = typeof value === 'number' ? numberToDecimalString(value) : value.trim()
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

function numberToDecimalString(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid numeric value "${value}"`)
  }

  const serialized = String(value)
  if (!/[eE]/.test(serialized)) {
    return serialized
  }

  const [rawCoefficient, rawExponent] = serialized.toLowerCase().split('e')
  const exponent = Number(rawExponent)
  if (!Number.isInteger(exponent)) {
    throw new Error(`Invalid numeric value "${value}"`)
  }

  const sign = rawCoefficient.startsWith('-') ? '-' : ''
  const coefficient = sign ? rawCoefficient.slice(1) : rawCoefficient
  const [integerPart, fractionPart = ''] = coefficient.split('.')
  const digits = `${integerPart}${fractionPart}`
  const decimalIndex = integerPart.length + exponent

  if (decimalIndex <= 0) {
    return `${sign}0.${'0'.repeat(Math.abs(decimalIndex))}${digits}`
  }

  if (decimalIndex >= digits.length) {
    return `${sign}${digits}${'0'.repeat(decimalIndex - digits.length)}`
  }

  return `${sign}${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`
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
  if (adjusted <= 0) {
    throw new Error(`Slippage "${slippage}" derives a non-positive market price`)
  }

  const roundedToPrecision = Number(adjusted.toPrecision(5))
  if (roundedToPrecision <= 0) {
    throw new Error(`Cannot derive a positive market price from mid "${midPrice}"`)
  }

  const decimals = Math.max(0, 8 - szDecimals)
  return toHyperliquidWireValue(roundedToPrecision.toFixed(decimals))
}
