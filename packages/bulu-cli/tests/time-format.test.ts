import { describe, expect, test } from 'vitest'
import { formatOpenOrderRows } from '../src/commands/market/perps/orders'
import {
  formatSpotFillRows,
  formatSpotHistoryOrderRows,
  formatSpotOpenOrderRows,
} from '../src/commands/market/spot/utils'
import { formatOptionalTimestamp, formatTimestamp } from '../src/core/time'
import type { HistoricalOrder, OpenOrder, UserFill } from '../src/protocols/hyperliquid'

describe('time formatting helpers', () => {
  test('formats unix seconds as ISO strings by default', () => {
    expect(formatTimestamp(1_700_000_000)).toBe('2023-11-14T22:13:20.000Z')
    expect(formatOptionalTimestamp(null)).toBe('Never')
  })

  test('formats millisecond timestamps as ISO strings by default', () => {
    expect(formatTimestamp(1_700_000_000_123)).toBe('2023-11-14T22:13:20.123Z')
  })

  test('supports explicit timestamp units when needed', () => {
    expect(formatTimestamp(1_700_000_000, { unit: 'unixMs' })).toBe('1970-01-20T16:13:20.000Z')
    expect(formatTimestamp(1_700_000_000, { unit: 'unix' })).toBe('2023-11-14T22:13:20.000Z')
  })
})

describe('open order display rows', () => {
  test('renders timestamps in readable form while preserving other fields', () => {
    const orders: OpenOrder[] = [
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

    expect(formatOpenOrderRows(orders)).toEqual([
      {
        coin: 'BTC',
        side: 'long',
        size: '0.01',
        origSize: '0.02',
        limitPx: '60000',
        tif: 'Gtc',
        triggerPx: 'N/A',
        cloid: 'N/A',
        positionTpsl: false,
        reduceOnly: false,
        oid: 42,
        timestamp: '2023-11-14T22:13:20.123Z',
      },
    ])
  })
})

describe('spot display rows', () => {
  test('renders open spot orders with readable timestamps', () => {
    const orders: OpenOrder[] = [
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

    expect(formatSpotOpenOrderRows(orders)).toEqual([
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
  })

  test('renders spot history rows and fills', () => {
    const history: HistoricalOrder[] = [
      {
        status: 'filled',
        statusTimestamp: 1_700_000_000_123,
        order: {
          coin: '@107',
          side: 'B',
          limitPx: '25.5',
          sz: '1.25',
          oid: 9,
          timestamp: 1_700_000_000_000,
          origSz: '1.5',
          reduceOnly: false,
          orderType: 'Limit',
          tif: 'Gtc',
          isTrigger: false,
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

    expect(formatSpotHistoryOrderRows(history)).toEqual([
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

    expect(formatSpotFillRows(fills)).toEqual([
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
