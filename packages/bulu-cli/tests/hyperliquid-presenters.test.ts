import { describe, expect, test } from 'vitest'
import { presentPerpOrders } from '../src/hyperliquid/features/perps/presenters/perps'
import { presentPriceSummary } from '../src/hyperliquid/features/price/presenters/present-price-summary'
import {
  presentSpotFills,
  presentSpotHistory,
  presentSpotOrders,
} from '../src/hyperliquid/features/spot/presenters/spot'
import type { HistoricalOrder, FrontendOpenOrder, UserFill } from '../src/hyperliquid/domain/types'

describe('presenter timestamp formatting', () => {
  test('renders perp open orders with readable timestamps', () => {
    const orders: FrontendOpenOrder[] = [
      {
        coin: 'BTC',
        side: 'B',
        limitPx: '60000',
        sz: '0.01',
        oid: 42,
        timestamp: 1_700_000_000_123,
        origSz: '0.02',
        reduceOnly: false,
        orderType: 'Limit',
        tif: 'Gtc',
        isTrigger: false,
      },
    ]

    const view = presentPerpOrders({ walletName: 'main', user: '0xabc', orders })
    expect(view.rows).toEqual([
      {
        coin: 'BTC',
        side: 'long',
        size: '0.01',
        origSize: '0.02',
        limitPx: '60000',
        tif: 'Gtc',
        triggerPx: 'N/A',
        positionTpsl: false,
        reduceOnly: false,
        oid: 42,
        cloid: 'N/A',
        timestamp: '2023-11-14T22:13:20.123Z',
      },
    ])
  })

  test('renders spot history rows and fills', () => {
    const orders: FrontendOpenOrder[] = [
      {
        coin: 'PURR/USDC',
        side: 'A',
        limitPx: '0.14',
        sz: '25',
        oid: 77,
        timestamp: 1_700_000_000_123,
        origSz: '30',
        reduceOnly: false,
        orderType: 'Limit',
        tif: 'Gtc',
        isTrigger: false,
      },
    ]
    const history: HistoricalOrder[] = [
      {
        status: 'filled',
        statusTimestamp: 1_700_000_000_123,
        order: {
          ...orders[0],
          coin: '@107',
          side: 'B',
          limitPx: '25.5',
          sz: '1.25',
          oid: 9,
          origSz: '1.5',
          cloid: '0x1234567890abcdef1234567890abcdef',
        },
      },
    ]
    const fills: UserFill[] = [
      {
        coin: '@107',
        side: 'B',
        px: '25.55',
        sz: '1.25',
        oid: 9,
        time: 1_700_000_000_123,
        fee: '0.01',
        dir: 'Open',
      },
    ]

    expect(presentSpotOrders({ walletName: 'main', user: '0xabc', orders }).rows).toEqual([
      {
        pair: 'PURR/USDC',
        side: 'sell',
        size: '25',
        origSize: '30',
        limitPx: '0.14',
        tif: 'Gtc',
        triggerPx: 'N/A',
        reduceOnly: false,
        oid: 77,
        cloid: 'N/A',
        timestamp: '2023-11-14T22:13:20.123Z',
      },
    ])

    expect(presentSpotHistory({ walletName: 'main', user: '0xabc', entries: history }).rows).toEqual([
      {
        pair: '@107',
        status: 'filled',
        side: 'buy',
        size: '1.25',
        origSize: '1.5',
        limitPx: '25.5',
        tif: 'Gtc',
        reduceOnly: false,
        oid: 9,
        cloid: '0x1234567890abcdef1234567890abcdef',
        statusTimestamp: '2023-11-14T22:13:20.123Z',
      },
    ])

    expect(presentSpotFills({ walletName: 'main', user: '0xabc', fills }).rows).toEqual([
      {
        time: '2023-11-14T22:13:20.123Z',
        pair: '@107',
        dir: 'Open',
        side: 'buy',
        size: '1.25',
        price: '25.55',
        fee: '0.01',
        closedPnl: 'N/A',
        oid: 9,
      },
    ])
  })
})

describe('price presenter output modes', () => {
  const summary = {
    pair: 'BTC',
    price: '100000',
    mark: '100001',
    oracle: '99999',
    periods: [{ period: '1H', change: '+1.00%', high: '101000', low: '99000', volume: '12345' }],
  }

  test('returns object payload for json mode', () => {
    const view = presentPriceSummary(summary, { json: true, format: 'json' })
    expect(view).toEqual({ kind: 'data', data: summary })
  })

  test('returns csv text for csv mode', () => {
    const view = presentPriceSummary(summary, { json: false, format: 'csv' })
    expect(view).toEqual({
      kind: 'data',
      data: 'pair,price,mark,oracle,period,change,high,low,volume\nBTC,100000,100001,99999,1H,+1.00%,101000,99000,12345',
    })
  })
})
