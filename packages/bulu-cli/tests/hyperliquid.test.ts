import { encode } from '@msgpack/msgpack'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { bytesToHex, concatBytes } from '@noble/hashes/utils.js'
import { describe, expect, test } from 'vitest'
import { createL1ActionHash } from '../src/protocols/hyperliquid/crypto'
import { normalizeDecimalInput } from '../src/protocols/hyperliquid/format'
import { findMarketAsset, resolveMarketPrice } from '../src/protocols/hyperliquid/market'
import {
  buildCancelAction,
  buildModifyAction,
  buildScheduleCancelAction,
  buildUpdateIsolatedMarginAction,
  buildUpdateLeverageAction,
  findPerpPosition,
  parseOrderIdentifier,
  resolvePerpOrder,
  resolvePerpTpslOrder,
  resolveTriggerKindFromOrder,
} from '../src/protocols/hyperliquid/trade'

function toUint64Bytes(n: bigint | number): Uint8Array {
  const bytes = new Uint8Array(8)
  const view = new DataView(bytes.buffer)
  view.setBigUint64(0, BigInt(n))
  return bytes
}

test('createL1ActionHash matches manual implementation', () => {
  const action = {
    type: 'order',
    orders: [{ a: 0, b: true, p: '74508', s: '0.00026', r: false, t: { limit: { tif: 'Gtc' } } }],
    grouping: 'na',
  } as const
  const nonce = 1700000000000

  const expected = createL1ActionHash({ action, nonce })

  const actionBytes = encode(action)
  const nonceBytes = toUint64Bytes(nonce)
  const vaultMarker = new Uint8Array([0])
  const manualHash = `0x${bytesToHex(keccak_256(concatBytes(actionBytes, nonceBytes, vaultMarker, new Uint8Array(), new Uint8Array(), new Uint8Array())))}`

  expect(expected).toBe(manualHash)
})

test('createL1ActionHash with vault address', () => {
  const action = {
    type: 'order',
    orders: [{ a: 1, b: false, p: '1000', s: '1', r: true, t: { limit: { tif: 'Ioc' } } }],
    grouping: 'na',
  } as const
  const nonce = 1700000000123
  const vaultAddress = '0xabcd000000000000000000000000000000000000' as const

  const expected = createL1ActionHash({ action, nonce, vaultAddress })

  const actionBytes = encode(action)
  const nonceBytes = toUint64Bytes(nonce)
  const vaultMarker = new Uint8Array([1])
  const vaultBytes = new Uint8Array(Buffer.from(vaultAddress.slice(2), 'hex'))
  const manualHash = `0x${bytesToHex(keccak_256(concatBytes(actionBytes, nonceBytes, vaultMarker, vaultBytes, new Uint8Array(), new Uint8Array())))}`

  expect(expected).toBe(manualHash)
})

test('createL1ActionHash with assetIndex 3 matches reference layout', () => {
  const action = {
    type: 'order',
    orders: [{ a: 3, b: true, p: '74508', s: '0.00026', r: false, t: { limit: { tif: 'Ioc' } } }],
    grouping: 'na',
  } as const
  const nonce = Date.now()

  // Ensure consistency with manual msgpack encoding
  const expected = createL1ActionHash({ action, nonce })
  const actionBytes = encode(action)
  const nonceBytes = toUint64Bytes(nonce)
  const vaultMarker = new Uint8Array([0])
  const manualHash = `0x${bytesToHex(keccak_256(concatBytes(actionBytes, nonceBytes, vaultMarker, new Uint8Array(), new Uint8Array(), new Uint8Array())))}`

  expect(expected).toBe(manualHash)
})

describe('market helpers', () => {
  test('findMarketAsset resolves metadata and context by coin', () => {
    const market = findMarketAsset('btc', {
      universe: [
        { name: 'BTC', szDecimals: 5, maxLeverage: 40 },
        { name: 'ETH', szDecimals: 4, maxLeverage: 25 },
      ],
      contexts: [{ markPx: '100000' }, { markPx: '2500' }],
    })

    expect(market).toEqual({
      assetIndex: 0,
      meta: { name: 'BTC', szDecimals: 5, maxLeverage: 40 },
      context: { markPx: '100000' },
    })
  })

  test('resolveMarketPrice falls back from mark to mid to oracle', () => {
    expect(resolveMarketPrice({ markPx: '101' })).toBe('101')
    expect(resolveMarketPrice({ midPx: '102' })).toBe('102')
    expect(resolveMarketPrice({ oraclePx: '103' })).toBe('103')
    expect(resolveMarketPrice(undefined)).toBeUndefined()
  })
})

describe('format helpers', () => {
  test('normalizeDecimalInput trims zeros and supports absolute conversion', () => {
    expect(normalizeDecimalInput('1.2300', 'price')).toBe('1.23')
    expect(normalizeDecimalInput('-0.5000', 'size', { absolute: true })).toBe('0.5')
  })

  test('normalizeDecimalInput rejects invalid decimal strings', () => {
    expect(() => normalizeDecimalInput('1e-3', 'size')).toThrow('Invalid size')
    expect(() => normalizeDecimalInput('0', 'size')).toThrow('size must be greater than zero')
  })
})

describe('perp order helpers', () => {
  const market = {
    assetIndex: 0,
    meta: { name: 'BTC', szDecimals: 3, maxLeverage: 40 },
    context: { markPx: '92500.5' },
  } as const

  test('findPerpPosition resolves by normalized coin', () => {
    const position = findPerpPosition('btc', {
      assetPositions: [
        {
          type: 'oneWay',
          position: {
            coin: 'BTC',
            szi: '-0.123',
            positionValue: '10000',
            unrealizedPnl: '15',
            leverage: { type: 'cross', value: 5 },
            marginUsed: '100',
            returnOnEquity: '0.1',
          },
        },
      ],
    })

    expect(position?.position.coin).toBe('BTC')
  })

  test('resolvePerpOrder builds a market order for opening a position', () => {
    const order = resolvePerpOrder({
      coin: 'btc',
      market,
      side: 'short',
      size: '1.23456',
    })

    expect(order.side).toBe('short')
    expect(order.size).toBe('1.234')
    expect(order.price).toBe('92500.5')
    expect(order.tif).toBe('FrontendMarket')
    expect(order.reduceOnly).toBe(false)
    expect(order.action.orders[0]).toMatchObject({
      a: 0,
      b: false,
      p: '92500.5',
      s: '1.234',
      r: false,
      t: { limit: { tif: 'FrontendMarket' } },
    })
  })

  test('resolvePerpOrder builds a reduce-only close order from current position', () => {
    const order = resolvePerpOrder({
      coin: 'BTC',
      market,
      close: true,
      state: {
        assetPositions: [
          {
            type: 'oneWay',
            position: {
              coin: 'BTC',
              szi: '-0.3339',
              positionValue: '30000',
              unrealizedPnl: '42',
              leverage: { type: 'cross', value: 3 },
              marginUsed: '200',
              returnOnEquity: '0.2',
            },
          },
        ],
      },
    })

    expect(order.side).toBe('long')
    expect(order.size).toBe('0.333')
    expect(order.reduceOnly).toBe(true)
    expect(order.action.orders[0]).toMatchObject({
      b: true,
      r: true,
      s: '0.333',
    })
  })

  test('resolvePerpTpslOrder builds a reduce-only trigger order', () => {
    const order = resolvePerpTpslOrder({
      coin: 'BTC',
      market,
      triggerPrice: '91000',
      state: {
        assetPositions: [
          {
            type: 'oneWay',
            position: {
              coin: 'BTC',
              szi: '0.75',
              positionValue: '60000',
              unrealizedPnl: '200',
              leverage: { type: 'cross', value: 4 },
              marginUsed: '500',
              returnOnEquity: '0.3',
            },
          },
        ],
      },
      tpsl: 'sl',
    })

    expect(order.side).toBe('short')
    expect(order.reduceOnly).toBe(true)
    expect(order.grouping).toBe('positionTpsl')
    expect(order.action.orders[0]).toMatchObject({
      b: false,
      p: '91000',
      r: true,
      t: {
        trigger: {
          isMarket: true,
          triggerPx: '91000',
          tpsl: 'sl',
        },
      },
    })
  })
})

describe('exchange action helpers', () => {
  test('build action helpers return expected payloads', () => {
    expect(buildCancelAction([{ a: 1, o: 2 }])).toEqual({ type: 'cancel', cancels: [{ a: 1, o: 2 }] })
    expect(
      buildModifyAction({ oid: 42, order: { a: 0, b: true, p: '1', s: '2', r: false, t: { limit: { tif: 'Gtc' } } } }),
    ).toEqual({
      type: 'modify',
      oid: 42,
      order: { a: 0, b: true, p: '1', s: '2', r: false, t: { limit: { tif: 'Gtc' } } },
    })
    expect(buildUpdateLeverageAction({ asset: 1, leverage: 5, isCross: true })).toEqual({
      type: 'updateLeverage',
      asset: 1,
      leverage: 5,
      isCross: true,
    })
    expect(buildUpdateIsolatedMarginAction({ asset: 1, ntli: 1_500_000 })).toEqual({
      type: 'updateIsolatedMargin',
      asset: 1,
      isBuy: true,
      ntli: 1_500_000,
    })
    expect(buildScheduleCancelAction()).toEqual({ type: 'scheduleCancel' })
    expect(buildScheduleCancelAction(1_700_000_000_000)).toEqual({ type: 'scheduleCancel', time: 1_700_000_000_000 })
  })
})

describe('order identifier helpers', () => {
  test('parseOrderIdentifier supports oid and cloid values', () => {
    expect(parseOrderIdentifier('42')).toBe(42)
    expect(parseOrderIdentifier('0x1234567890abcdef1234567890abcdef')).toBe('0x1234567890abcdef1234567890abcdef')
  })

  test('resolveTriggerKindFromOrder infers trigger type from metadata', () => {
    expect(resolveTriggerKindFromOrder({ triggerCondition: 'Tp', orderType: 'Take Profit Market' })).toBe('tp')
    expect(resolveTriggerKindFromOrder({ triggerCondition: undefined, orderType: 'Stop Market' })).toBe('sl')
  })
})
