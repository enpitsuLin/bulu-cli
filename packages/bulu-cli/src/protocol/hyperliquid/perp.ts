import { toHyperliquidWireValue } from './spot'
import type {
  HyperliquidPerpDexsResponse,
  HyperliquidPerpMarketLookup,
  HyperliquidPerpMeta,
  HyperliquidResolvedPerpMarket,
} from './types'

const lookupCache = new WeakMap<HyperliquidPerpMeta, Map<number, HyperliquidPerpMarketLookup>>()

export function resolvePerpDexIndex(dexs: HyperliquidPerpDexsResponse, dex: string): number {
  const normalized = dex.trim().toLowerCase()
  if (!normalized) {
    return 0
  }

  const index = dexs.findIndex((entry) => entry?.name.toLowerCase() === normalized)
  if (index < 0) {
    const suggestions = dexs
      .filter((entry): entry is NonNullable<(typeof dexs)[number]> => entry != null)
      .slice(0, 8)
      .map((entry) => entry.name)
      .join(', ')
    throw new Error(
      suggestions
        ? `Unknown Hyperliquid perp dex "${dex}". Available dexs include: ${suggestions}`
        : `Unknown Hyperliquid perp dex "${dex}"`,
    )
  }

  return index
}

export function buildPerpMarketLookup(meta: HyperliquidPerpMeta, perpDexIndex = 0): HyperliquidPerpMarketLookup {
  let cacheByDex = lookupCache.get(meta)
  if (!cacheByDex) {
    cacheByDex = new Map()
    lookupCache.set(meta, cacheByDex)
  }

  const cached = cacheByDex.get(perpDexIndex)
  if (cached) {
    return cached
  }

  const byCoin = new Map<string, HyperliquidResolvedPerpMarket>()
  const aliases = new Map<string, HyperliquidResolvedPerpMarket>()
  const markets = meta.universe.map((entry, index) => {
    const isBuilderDeployed = perpDexIndex > 0 || entry.name.includes(':')
    const market = {
      asset: isBuilderDeployed ? 100000 + perpDexIndex * 10000 + index : index,
      coin: entry.name,
      index,
      maxLeverage: entry.maxLeverage,
      szDecimals: entry.szDecimals,
      onlyIsolated: entry.onlyIsolated ?? (entry.marginMode === 'strictIsolated' || entry.marginMode === 'noCross'),
      isDelisted: entry.isDelisted ?? false,
      marginMode: entry.marginMode,
      marginTableId: entry.marginTableId,
    } satisfies HyperliquidResolvedPerpMarket

    byCoin.set(entry.name.toUpperCase(), market)
    aliases.set(entry.name.toUpperCase(), market)

    const [, shortName] = entry.name.split(':')
    if (shortName) {
      aliases.set(shortName.toUpperCase(), market)
    }

    return market
  })

  const lookup = {
    markets,
    byCoin,
    aliases,
  }

  cacheByDex.set(perpDexIndex, lookup)
  return lookup
}

type PerpMarketSource = HyperliquidPerpMeta | HyperliquidPerpMarketLookup

function getPerpMarketLookup(source: PerpMarketSource): HyperliquidPerpMarketLookup {
  return 'byCoin' in source ? source : buildPerpMarketLookup(source)
}

export function resolvePerpMarket(source: PerpMarketSource, input: string): HyperliquidResolvedPerpMarket {
  const key = input.trim().toUpperCase()
  if (!key) {
    throw new Error('Perp market is required')
  }

  const lookup = getPerpMarketLookup(source)
  const market = lookup.aliases.get(key) ?? lookup.byCoin.get(key)
  if (!market) {
    const suggestions = lookup.markets
      .slice(0, 8)
      .map((m) => m.coin)
      .join(', ')
    throw new Error(`Unknown Hyperliquid perp market "${input}". Available markets include: ${suggestions}...`)
  }

  return market
}

export function isPerpCoin(source: PerpMarketSource, coin: string): boolean {
  return getPerpMarketLookup(source).byCoin.has(coin.trim().toUpperCase())
}

export function formatPerpCoin(source: PerpMarketSource, coin: string): string {
  return getPerpMarketLookup(source).byCoin.get(coin.trim().toUpperCase())?.coin ?? coin
}

export function toHyperliquidUsdInt(value: string | number): number {
  const normalized = toHyperliquidWireValue(value)
  const sign = normalized.startsWith('-') ? -1n : 1n
  const unsigned = sign < 0n ? normalized.slice(1) : normalized
  const [integerPart, fractionPart = ''] = unsigned.split('.')

  if (fractionPart.length > 6) {
    throw new Error(`USDC amount "${value}" has more than 6 decimal places`)
  }

  const raw = BigInt(integerPart) * 1_000_000n + BigInt(fractionPart.padEnd(6, '0') || '0')
  const signed = raw * sign
  if (signed > BigInt(Number.MAX_SAFE_INTEGER) || signed < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error(`USDC amount "${value}" is too large`)
  }

  return Number(signed)
}

export function buildPerpMarketPriceFromMid(
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

  const decimals = Math.max(0, 6 - szDecimals)
  return toHyperliquidWireValue(roundedToPrecision.toFixed(decimals))
}
