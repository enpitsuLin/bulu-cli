import { encode } from '@msgpack/msgpack'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { bytesToHex, concatBytes, hexToBytes } from '@noble/hashes/utils.js'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const

function toUint64Bytes(n: bigint | number): Uint8Array {
  const bytes = new Uint8Array(8)
  const view = new DataView(bytes.buffer)
  view.setBigUint64(0, BigInt(n))
  return bytes
}

function removeUndefinedKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(removeUndefinedKeys)
  }
  if (typeof obj === 'object' && obj !== null) {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        result[key] = removeUndefinedKeys(value)
      }
    }
    return result
  }
  return obj
}

function largeIntToBigInt(obj: unknown): unknown {
  if (typeof obj === 'number' && Number.isInteger(obj) && (obj >= 0x100000000 || obj < -0x80000000)) {
    return BigInt(obj)
  }
  if (Array.isArray(obj)) {
    return obj.map(largeIntToBigInt)
  }
  if (typeof obj === 'object' && obj !== null) {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      result[key] = largeIntToBigInt(value)
    }
    return result
  }
  return obj
}

export function createL1ActionHash(args: {
  action: Record<string, unknown> | unknown[]
  nonce: number
  vaultAddress?: `0x${string}`
  expiresAfter?: number
}): `0x${string}` {
  const { action, nonce, vaultAddress, expiresAfter } = args

  const cleaned = removeUndefinedKeys(action) as Record<string, unknown> | unknown[]
  const actionBytes = encode(largeIntToBigInt(cleaned))
  const nonceBytes = toUint64Bytes(nonce)

  const vaultMarker = vaultAddress ? new Uint8Array([1]) : new Uint8Array([0])
  const vaultBytes = vaultAddress ? hexToBytes(vaultAddress.slice(2)) : new Uint8Array()

  const expiresMarker = expiresAfter !== undefined ? new Uint8Array([0]) : new Uint8Array()
  const expiresBytes = expiresAfter !== undefined ? toUint64Bytes(expiresAfter) : new Uint8Array()

  const bytes = concatBytes(actionBytes, nonceBytes, vaultMarker, vaultBytes, expiresMarker, expiresBytes)
  const hash = keccak_256(bytes)
  return `0x${bytesToHex(hash)}` as `0x${string}`
}

export function buildHyperliquidTypedData(args: { hash: `0x${string}`; isTestnet?: boolean }): {
  types: {
    EIP712Domain: Array<{ name: string; type: string }>
    Agent: Array<{ name: string; type: string }>
  }
  primaryType: string
  domain: {
    name: string
    version: string
    chainId: string
    verifyingContract: typeof ZERO_ADDRESS
  }
  message: {
    source: string
    connectionId: `0x${string}`
  }
} {
  const { hash, isTestnet = false } = args
  return {
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      Agent: [
        { name: 'source', type: 'string' },
        { name: 'connectionId', type: 'bytes32' },
      ],
    },
    primaryType: 'Agent',
    domain: {
      name: 'Exchange',
      version: '1',
      chainId: '1337',
      verifyingContract: ZERO_ADDRESS,
    },
    message: {
      source: isTestnet ? 'b' : 'a',
      connectionId: hash,
    },
  }
}

export function splitSignature(signature: `0x${string}`): { r: `0x${string}`; s: `0x${string}`; v: number } {
  if (signature.length !== 132) {
    throw new Error(`Expected 65-byte signature (132 hex chars), got ${signature.length}`)
  }
  const r = `0x${signature.slice(2, 66)}` as `0x${string}`
  const s = `0x${signature.slice(66, 130)}` as `0x${string}`
  let v = parseInt(signature.slice(130, 132), 16)
  if (v === 0 || v === 1) v += 27
  if (v !== 27 && v !== 28) {
    throw new Error(`Invalid signature recovery value: ${v}, expected 27 or 28`)
  }
  return { r, s, v }
}
