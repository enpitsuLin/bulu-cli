import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { importWalletPrivateKey } from '@bulu-cli/tcx-core'
import {
  buildMarketPriceFromMid,
  buildSpotMarketLookup,
  formatSpotCoin,
  HYPERLIQUID_MAINNET_API_URL,
  HYPERLIQUID_TESTNET_API_URL,
  isHyperliquidTestnetValue,
  resolveHyperliquidConnection,
  resolveSpotMarket,
  signHyperliquidL1Action,
  toHyperliquidWireValue,
  type HyperliquidSpotMeta,
} from './index'

const PRIVATE_KEY = 'a392604efc2fad9c0b3da43b5f698a2e3f270f170d859912be0d54742275c5f6'
const PASSWORD = 'imToken'

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

describe('resolveHyperliquidConnection', () => {
  it('prefers explicit config api base over flag and env', () => {
    expect(
      resolveHyperliquidConnection(' https://api.hyperliquid.xyz/custom/ ', {
        testnet: true,
        envValue: 'testnet',
      }),
    ).toEqual({
      apiBase: 'https://api.hyperliquid.xyz/custom',
      isTestnet: false,
    })
  })

  it('uses testnet endpoint when flag is set and config is absent', () => {
    expect(resolveHyperliquidConnection(undefined, { testnet: true })).toEqual({
      apiBase: HYPERLIQUID_TESTNET_API_URL,
      isTestnet: true,
    })
  })

  it('uses env switch when config is absent', () => {
    expect(resolveHyperliquidConnection(undefined, { envValue: 'testnet' })).toEqual({
      apiBase: HYPERLIQUID_TESTNET_API_URL,
      isTestnet: true,
    })
    expect(resolveHyperliquidConnection(undefined, { envValue: 'mainnet' })).toEqual({
      apiBase: HYPERLIQUID_MAINNET_API_URL,
      isTestnet: false,
    })
  })
})

describe('Hyperliquid spot helpers', () => {
  it('parses testnet env values', () => {
    expect(isHyperliquidTestnetValue('true')).toBe(true)
    expect(isHyperliquidTestnetValue('TESTNET')).toBe(true)
    expect(isHyperliquidTestnetValue(HYPERLIQUID_TESTNET_API_URL)).toBe(true)
    expect(isHyperliquidTestnetValue('false')).toBe(false)
    expect(isHyperliquidTestnetValue('')).toBe(false)
  })

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

  it('signs l1 actions with Hyperliquid typed data envelope', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'bulu-hyperliquid-sign-'))

    try {
      importWalletPrivateKey('Signer', PRIVATE_KEY, PASSWORD, tempDir)

      const signature = signHyperliquidL1Action({
        walletName: 'Signer',
        credential: PASSWORD,
        vaultPath: tempDir,
        nonce: 1710000000000,
        isTestnet: false,
        action: {
          type: 'order',
          orders: [
            {
              a: 10000,
              b: true,
              p: '0.25',
              s: '10',
              r: false,
              t: { limit: { tif: 'Gtc' } },
            },
          ],
          grouping: 'na',
        },
      })

      expect(signature).toEqual({
        r: '0x9aa0ad2a1f1a83d79115fedfac773b083c9d47208884bd4668aa940881fdd665',
        s: '0x11d73c26835d4fb2f02e20f15799d91e325451382e8facfac9210c8cc670335f',
        v: 27,
      })
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
