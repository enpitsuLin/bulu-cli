import { describe, expect, it } from 'vitest'
import {
  buildPerpMarketLookup,
  formatPerpCoin,
  resolvePerpDexIndex,
  resolvePerpMarket,
  toHyperliquidUsdInt,
} from './perp'
import type { HyperliquidPerpDexsResponse, HyperliquidPerpMeta } from './types'

const PERP_META_FIXTURE: HyperliquidPerpMeta = {
  universe: [
    {
      name: 'BTC',
      szDecimals: 5,
      maxLeverage: 50,
    },
    {
      name: 'test:ABC',
      szDecimals: 2,
      maxLeverage: 10,
      marginMode: 'strictIsolated',
    },
  ],
  marginTables: [
    [
      50,
      {
        description: '',
        marginTiers: [
          {
            lowerBound: '0.0',
            maxLeverage: 50,
          },
        ],
      },
    ],
  ],
}

const PERP_DEXS_FIXTURE: HyperliquidPerpDexsResponse = [
  null,
  {
    name: 'test',
    fullName: 'test dex',
  },
]

describe('Hyperliquid perp helpers', () => {
  it('builds lookup and resolves default perp asset ids', () => {
    const lookup = buildPerpMarketLookup(PERP_META_FIXTURE)

    expect(lookup.markets).toHaveLength(2)
    expect(buildPerpMarketLookup(PERP_META_FIXTURE)).toBe(lookup)
    expect(resolvePerpMarket(PERP_META_FIXTURE, 'btc').asset).toBe(0)
    expect(resolvePerpMarket(lookup, 'test:abc').asset).toBe(1)
    expect(resolvePerpMarket(lookup, 'abc').coin).toBe('test:ABC')
    expect(formatPerpCoin(lookup, ' btc ')).toBe('BTC')
  })

  it('builds builder-deployed perp asset ids from dex index', () => {
    const lookup = buildPerpMarketLookup(PERP_META_FIXTURE, 1)

    expect(resolvePerpDexIndex(PERP_DEXS_FIXTURE, 'test')).toBe(1)
    expect(resolvePerpDexIndex(PERP_DEXS_FIXTURE, '')).toBe(0)
    expect(resolvePerpMarket(lookup, 'BTC').asset).toBe(110000)
    expect(resolvePerpMarket(lookup, 'test:ABC').asset).toBe(110001)
  })

  it('converts USDC amounts to Hyperliquid raw integer units', () => {
    expect(toHyperliquidUsdInt('1')).toBe(1_000_000)
    expect(toHyperliquidUsdInt('1.23')).toBe(1_230_000)
    expect(toHyperliquidUsdInt('0.000001')).toBe(1)
    expect(toHyperliquidUsdInt('-2.5')).toBe(-2_500_000)
    expect(() => toHyperliquidUsdInt('0.0000001')).toThrow('more than 6 decimal places')
  })
})
