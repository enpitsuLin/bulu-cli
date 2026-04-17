import { describe, expect, test } from 'vitest'
import { formatOpenOrderRows } from '../src/commands/market/perps/orders'
import { formatOptionalTimestamp, formatTimestamp } from '../src/core/time'
import type { OpenOrder } from '../src/protocols/hyperliquid'

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
