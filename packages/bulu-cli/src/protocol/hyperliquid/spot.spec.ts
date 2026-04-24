import { describe, expect, it } from 'vitest'
import {
  buildMarketPriceFromMid,
  buildSpotMarketLookup,
  formatSpotCoin,
  resolveSpotMarket,
  toHyperliquidWireValue,
} from './spot'
import type { HyperliquidSpotMeta } from './types'

const SPOT_META_FIXTURE: HyperliquidSpotMeta = {
  tokens: [
    {
      name: 'USDC',
      szDecimals: 8,
      weiDecimals: 8,
      index: 0,
      tokenId: '0x00',
      isCanonical: true,
    },
    {
      name: 'PURR',
      szDecimals: 0,
      weiDecimals: 5,
      index: 1,
      tokenId: '0x01',
      isCanonical: true,
    },
    {
      name: 'HFUN',
      szDecimals: 2,
      weiDecimals: 8,
      index: 2,
      tokenId: '0x02',
      isCanonical: false,
    },
  ],
  universe: [
    {
      name: 'PURR/USDC',
      tokens: [1, 0],
      index: 0,
      isCanonical: true,
    },
    {
      name: '@1',
      tokens: [2, 0],
      index: 1,
      isCanonical: false,
    },
  ],
}

describe('Hyperliquid spot helpers', () => {
  it('builds lookup and resolves aliases', () => {
    const lookup = buildSpotMarketLookup(SPOT_META_FIXTURE)

    expect(lookup.markets).toHaveLength(2)
    expect(resolveSpotMarket(SPOT_META_FIXTURE, 'PURR/USDC').asset).toBe(10000)
    expect(resolveSpotMarket(SPOT_META_FIXTURE, '@1').asset).toBe(10001)
    expect(formatSpotCoin(SPOT_META_FIXTURE, '@1')).toBe('HFUN/USDC')
  })

  it('normalizes numeric wire values', () => {
    expect(toHyperliquidWireValue('001.2300')).toBe('1.23')
    expect(toHyperliquidWireValue('.5')).toBe('0.5')
    expect(toHyperliquidWireValue('0.0000')).toBe('0')
  })

  it('derives aggressive spot market prices from mids', () => {
    expect(buildMarketPriceFromMid('0.209265', true, '0.03', 0)).toBe('0.21554')
    expect(buildMarketPriceFromMid('123.456', false, 0.01, 2)).toBe('122.22')
  })
})
