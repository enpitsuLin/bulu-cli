import { encode } from '@msgpack/msgpack'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { bytesToHex, concatBytes } from '@noble/hashes/utils.js'
import { expect, test } from 'vitest'
import { createL1ActionHash } from '../src/protocols/hyperliquid/crypto'

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
