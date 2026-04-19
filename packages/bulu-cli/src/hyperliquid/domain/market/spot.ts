import type { SpotMeta } from '../types'

export function normalizeSpotPair(pair: string): string {
  const trimmed = pair.trim()
  if (!trimmed) {
    throw new Error('Spot pair is required')
  }

  if (trimmed.startsWith('@') || trimmed.startsWith('#')) {
    return trimmed
  }

  return trimmed.toUpperCase()
}

export function buildSpotPairNameSet(spotMeta: Pick<SpotMeta, 'universe'>): Set<string> {
  return new Set(spotMeta.universe.map((pair) => normalizeSpotPair(pair.name)))
}

export function isSpotPairName(coin: string, spotMeta: Pick<SpotMeta, 'universe'> | Set<string>): boolean {
  const spotPairs = spotMeta instanceof Set ? spotMeta : buildSpotPairNameSet(spotMeta)
  return spotPairs.has(normalizeSpotPair(coin))
}

export function partitionEntriesBySpot<T extends { coin: string }>(
  entries: T[],
  spotMeta: Pick<SpotMeta, 'universe'> | Set<string>,
): { spot: T[]; perps: T[] } {
  const spotPairs = spotMeta instanceof Set ? spotMeta : buildSpotPairNameSet(spotMeta)
  const spot: T[] = []
  const perps: T[] = []

  for (const entry of entries) {
    if (spotPairs.has(normalizeSpotPair(entry.coin))) {
      spot.push(entry)
    } else {
      perps.push(entry)
    }
  }

  return { spot, perps }
}
