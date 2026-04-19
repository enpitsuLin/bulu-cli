import { describe, expect, test } from 'vitest'
import { cancelPerpOrders, modifyPerpOrder, placePerpTpsl } from '../src/hyperliquid/features/perps/use-cases/perps'
import { listSpotHistory } from '../src/hyperliquid/features/spot/use-cases/spot'
import type { HyperliquidWalletContext } from '../src/hyperliquid/shared/context'
import type { HistoricalOrder } from '../src/hyperliquid/domain/types'

const out = {
  data() {},
  table() {},
  success() {},
  warn() {},
}

const ctx: HyperliquidWalletContext = {
  out,
  testnet: false,
  walletName: 'main',
  user: '0xabc',
}

describe('perp use cases', () => {
  test('cancelPerpOrders rejects spot order ids', async () => {
    const deps = {
      fetchClearinghouseState: async () => ({
        assetPositions: [],
        crossMaintenanceMarginUsed: '0',
        crossMarginSummary: {} as never,
        marginSummary: {} as never,
        time: 0,
      }),
      fetchFrontendOpenOrders: async () => [
        {
          coin: 'PURR/USDC',
          side: 'B',
          limitPx: '1',
          sz: '1',
          oid: 9,
          timestamp: 1,
          origSz: '1',
          reduceOnly: false,
          orderType: 'Limit',
          tif: 'Gtc',
          isTrigger: false,
        },
      ],
      fetchHistoricalOrders: async () => [],
      fetchMetaAndAssetCtxs: async () => ({ universe: [], contexts: [] }),
      fetchOrderStatus: async () => null,
      fetchSpotMeta: async () => ({
        tokens: [],
        universe: [{ name: 'PURR/USDC', tokens: [1, 0], index: 0, isCanonical: true }],
      }),
      fetchUserFills: async () => [],
      fetchUserFillsByTime: async () => [],
      submitExchangeAction: async () => ({ status: 'ok', response: { type: 'default' } }),
    } satisfies NonNullable<Parameters<typeof cancelPerpOrders>[2]>

    await expect(cancelPerpOrders(ctx, { id: '9' }, deps)).rejects.toThrow('belongs to spot')
  })

  test('modifyPerpOrder builds updated order wire', async () => {
    const deps = {
      fetchClearinghouseState: async () => ({
        assetPositions: [],
        crossMaintenanceMarginUsed: '0',
        crossMarginSummary: {} as never,
        marginSummary: {} as never,
        time: 0,
      }),
      fetchFrontendOpenOrders: async () => [
        {
          coin: 'BTC',
          side: 'B',
          limitPx: '100',
          sz: '1.5',
          oid: 42,
          timestamp: 1,
          origSz: '2',
          reduceOnly: false,
          orderType: 'Limit',
          tif: 'Gtc',
          isTrigger: false,
        },
      ],
      fetchHistoricalOrders: async () => [],
      fetchMetaAndAssetCtxs: async () => ({
        universe: [{ name: 'BTC', szDecimals: 3, maxLeverage: 40 }],
        contexts: [{ markPx: '101' }],
      }),
      fetchOrderStatus: async () => null,
      fetchSpotMeta: async () => ({ tokens: [], universe: [] }),
      fetchUserFills: async () => [],
      fetchUserFillsByTime: async () => [],
      submitExchangeAction: async () => ({ status: 'ok', response: { type: 'default' } }),
    } satisfies NonNullable<Parameters<typeof modifyPerpOrder>[2]>

    const result = await modifyPerpOrder(ctx, { id: '42', size: '3', price: '105' }, deps)
    expect(result.wire).toMatchObject({ s: '3', p: '105', r: false })
  })

  test('placePerpTpsl fails when no open position exists', async () => {
    const deps = {
      fetchClearinghouseState: async () => ({
        assetPositions: [],
        crossMaintenanceMarginUsed: '0',
        crossMarginSummary: { accountValue: '0', totalMarginUsed: '0', totalNtlPos: '0', totalRawUsd: '0' },
        marginSummary: { accountValue: '0', totalMarginUsed: '0', totalNtlPos: '0', totalRawUsd: '0' },
        time: 0,
      }),
      fetchFrontendOpenOrders: async () => [],
      fetchHistoricalOrders: async () => [],
      fetchMetaAndAssetCtxs: async () => ({
        universe: [{ name: 'BTC', szDecimals: 3, maxLeverage: 40 }],
        contexts: [{ markPx: '100' }],
      }),
      fetchOrderStatus: async () => null,
      fetchSpotMeta: async () => ({ tokens: [], universe: [] }),
      fetchUserFills: async () => [],
      fetchUserFillsByTime: async () => [],
      submitExchangeAction: async () => ({ status: 'ok', response: { type: 'default' } }),
    } satisfies NonNullable<Parameters<typeof placePerpTpsl>[2]>

    await expect(placePerpTpsl(ctx, { coin: 'BTC', trigger: '90', tpsl: 'sl' }, deps)).rejects.toThrow(
      'No open position',
    )
  })
})

describe('spot use cases', () => {
  test('listSpotHistory filters spot pairs and status', async () => {
    const history: HistoricalOrder[] = [
      {
        status: 'filled',
        statusTimestamp: 1,
        order: {
          coin: 'BTC',
          side: 'B',
          limitPx: '100',
          sz: '1',
          oid: 1,
          timestamp: 1,
          origSz: '1',
          reduceOnly: false,
          orderType: 'Limit',
          tif: 'Gtc',
          isTrigger: false,
        },
      },
      {
        status: 'filled',
        statusTimestamp: 1,
        order: {
          coin: 'PURR/USDC',
          side: 'A',
          limitPx: '0.14',
          sz: '10',
          oid: 2,
          timestamp: 1,
          origSz: '10',
          reduceOnly: false,
          orderType: 'Limit',
          tif: 'Gtc',
          isTrigger: false,
        },
      },
    ]

    const deps = {
      fetchFrontendOpenOrders: async () => [],
      fetchHistoricalOrders: async () => history,
      fetchSpotClearinghouseState: async () => ({ balances: [] }),
      fetchSpotMeta: async () => ({
        tokens: [],
        universe: [{ name: 'PURR/USDC', tokens: [1, 0], index: 0, isCanonical: true }],
      }),
      fetchSpotMetaAndAssetCtxs: async () => ({ meta: { tokens: [], universe: [] }, contexts: [] }),
      fetchUserFills: async () => [],
      fetchUserFillsByTime: async () => [],
      submitExchangeAction: async () => ({ status: 'ok', response: { type: 'default' } }),
    } satisfies NonNullable<Parameters<typeof listSpotHistory>[2]>

    const result = await listSpotHistory(ctx, { pair: 'PURR/USDC', status: 'filled', limit: '10' }, deps)
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]?.order.coin).toBe('PURR/USDC')
  })
})
