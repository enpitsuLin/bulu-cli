import { expect, test } from 'vitest'
import { createL1ActionHash as ourCreateL1ActionHash } from '../src/protocols/hyperliquid/signing'
import { createL1ActionHash as refCreateL1ActionHash } from '@nktkas/hyperliquid/signing'

test('createL1ActionHash matches @nktkas/hyperliquid reference', () => {
  const action = {
    type: 'order',
    orders: [{ a: 0, b: true, p: '74508', s: '0.00026', r: false, t: { limit: { tif: 'Ioc' } } }],
    grouping: 'na',
  } as const
  const nonce = 1700000000000

  const expected = refCreateL1ActionHash({ action, nonce })
  const actual = ourCreateL1ActionHash({ action, nonce })

  expect(actual).toBe(expected)
})

test('createL1ActionHash with vault address matches reference', () => {
  const action = {
    type: 'order',
    orders: [{ a: 1, b: false, p: '1000', s: '1', r: true, t: { limit: { tif: 'Gtc' } } }],
    grouping: 'na',
  } as const
  const nonce = 1700000000123
  const vaultAddress = '0xabcd000000000000000000000000000000000000' as const

  const expected = refCreateL1ActionHash({ action, nonce, vaultAddress })
  const actual = ourCreateL1ActionHash({ action, nonce, vaultAddress })

  expect(actual).toBe(expected)
})

test('createL1ActionHash with assetIndex 3 matches reference', () => {
  const action = {
    type: 'order',
    orders: [{ a: 3, b: true, p: '74508', s: '0.00026', r: false, t: { limit: { tif: 'Ioc' } } }],
    grouping: 'na',
  } as const
  const nonce = Date.now()

  const expected = refCreateL1ActionHash({ action, nonce })
  const actual = ourCreateL1ActionHash({ action, nonce })

  expect(actual).toBe(expected)
})
