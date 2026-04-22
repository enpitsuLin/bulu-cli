import { AsyncLocalStorage } from 'node:async_hooks'
import { signTypedData } from '@bulu-cli/tcx-core'
import { encode } from '@msgpack/msgpack'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { ofetch } from 'ofetch'
import { createContext } from 'unctx'
import { useConfig } from '#/core/config'
import type {
  HyperliquidClient,
  HyperliquidConnection,
  HyperliquidExchangeSignature,
  HyperliquidOpenOrder,
  HyperliquidOrderStatusResponse,
  HyperliquidSignL1ActionInput,
  HyperliquidSpotMeta,
  HyperliquidSpotBalancesResponse,
  HyperliquidSpotMetaAndAssetCtxs,
  HyperliquidSubmitL1ActionInput,
} from './types'

export const HYPERLIQUID_MAINNET_API_URL = 'https://api.hyperliquid.xyz'
export const HYPERLIQUID_TESTNET_API_URL = 'https://api.hyperliquid-testnet.xyz'
export const HYPERLIQUID_L1_CHAIN_ID = 'eip155:1337'

export const hyperliquidClientCtx = createContext<HyperliquidClient>({
  asyncContext: true,
  AsyncLocalStorage,
})

export function useHyperliquidClient(): HyperliquidClient {
  return hyperliquidClientCtx.use()
}

function normalizeApiBase(apiBase: string): string {
  return apiBase.trim().replace(/\/+$/, '')
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const size = chunks.reduce((total, chunk) => total + chunk.length, 0)
  const merged = new Uint8Array(size)
  let offset = 0

  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.length
  }

  return merged
}

function stripHexPrefix(value: string): string {
  return value.startsWith('0x') || value.startsWith('0X') ? value.slice(2) : value
}

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.length % 2 === 0 ? hex : `0${hex}`
  return Uint8Array.from(Buffer.from(normalized, 'hex'))
}

function isExplicitTrue(value: string): boolean {
  return ['1', 'true', 'yes', 'on', 'testnet'].includes(value)
}

function isExplicitFalse(value: string): boolean {
  return ['0', 'false', 'no', 'off', 'mainnet'].includes(value)
}

export function isHyperliquidTestnetValue(value?: string | null): boolean {
  if (value == null) {
    return false
  }

  const normalized = value.trim().toLowerCase()
  if (!normalized) {
    return false
  }

  if (isExplicitTrue(normalized)) {
    return true
  }

  if (isExplicitFalse(normalized)) {
    return false
  }

  return normalized.includes('testnet')
}

export function resolveHyperliquidConnection(
  configuredApiBase: string | undefined,
  opts: {
    testnet?: boolean
    envValue?: string | undefined
  } = {},
): HyperliquidConnection {
  if (configuredApiBase?.trim()) {
    const apiBase = normalizeApiBase(configuredApiBase)
    return {
      apiBase,
      isTestnet: isHyperliquidTestnetValue(apiBase),
    }
  }

  const useTestnet = Boolean(opts.testnet) || isHyperliquidTestnetValue(opts.envValue)
  return {
    apiBase: useTestnet ? HYPERLIQUID_TESTNET_API_URL : HYPERLIQUID_MAINNET_API_URL,
    isTestnet: useTestnet,
  }
}

export function createHyperliquidClient(
  opts: {
    testnet?: boolean
    envValue?: string | undefined
  } = {},
): HyperliquidClient {
  const config = useConfig()
  const connection = resolveHyperliquidConnection(config.get('hyperliquid.apiBase'), opts)
  let spotMetaPromise: Promise<HyperliquidSpotMeta> | undefined
  let spotMetaAndAssetCtxsPromise: Promise<HyperliquidSpotMetaAndAssetCtxs> | undefined
  const request = ofetch.create({
    baseURL: connection.apiBase,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    onRequestError({ error }) {
      throw createHyperliquidRequestError({
        error,
      })
    },
    onResponseError({ response }) {
      throw createHyperliquidRequestError({
        data: response._data,
        fallback: `${response.status} ${response.statusText}`.trim(),
      })
    },
  })

  return {
    apiBase: connection.apiBase,
    isTestnet: connection.isTestnet,
    async getSpotMeta() {
      if (!spotMetaPromise) {
        if (spotMetaAndAssetCtxsPromise) {
          spotMetaPromise = spotMetaAndAssetCtxsPromise.then(([spotMeta]) => spotMeta)
        } else {
          spotMetaPromise = request<HyperliquidSpotMeta>('/info', { body: { type: 'spotMeta' } })
        }
      }

      return spotMetaPromise
    },
    async getSpotMetaAndAssetCtxs() {
      if (!spotMetaAndAssetCtxsPromise) {
        spotMetaAndAssetCtxsPromise = request<HyperliquidSpotMetaAndAssetCtxs>('/info', {
          body: { type: 'spotMetaAndAssetCtxs' },
        })
      }
      if (!spotMetaPromise) {
        spotMetaPromise = spotMetaAndAssetCtxsPromise.then(([spotMeta]) => spotMeta)
      }

      return spotMetaAndAssetCtxsPromise
    },
    async getSpotBalances(user: string) {
      return request<HyperliquidSpotBalancesResponse>('/info', {
        body: {
          type: 'spotClearinghouseState',
          user: user.toLowerCase(),
        },
      })
    },
    async getOpenOrders(user: string) {
      return request<HyperliquidOpenOrder[]>('/info', {
        body: {
          type: 'frontendOpenOrders',
          user: user.toLowerCase(),
          dex: '',
        },
      })
    },
    async getOrderStatus(user: string, oid: number | string) {
      return request<HyperliquidOrderStatusResponse>('/info', {
        body: {
          type: 'orderStatus',
          user: user.toLowerCase(),
          oid,
        },
      })
    },
    async getAllMids() {
      return request<Record<string, string>>('/info', {
        body: {
          type: 'allMids',
          dex: '',
        },
      })
    },
    async submitL1Action<T>(input: HyperliquidSubmitL1ActionInput) {
      const nonce = input.nonce ?? Date.now()
      const signature = signHyperliquidL1Action({
        walletName: input.walletName,
        credential: input.credential,
        vaultPath: input.vaultPath,
        action: input.action,
        nonce,
        vaultAddress: input.vaultAddress,
        isTestnet: connection.isTestnet,
      })
      const response = await request<T>('/exchange', {
        body: {
          action: input.action,
          nonce,
          signature,
        },
      })

      return { nonce, response }
    },
  }
}

function createHyperliquidRequestError(input: { error?: unknown; data?: unknown; fallback?: string }): Error {
  let message = input.fallback ?? 'Unknown error'

  if (input.error instanceof Error && input.error.message) {
    message = input.error.message
  }

  const data =
    input.data ??
    (input.error != null && typeof input.error === 'object' && 'data' in input.error ? input.error.data : undefined)
  if (data != null) {
    message = typeof data === 'string' ? data : JSON.stringify(data)
  }

  return new Error(
    `Hyperliquid request failed: ${message}`,
    input.error instanceof Error ? { cause: input.error } : undefined,
  )
}

export function signHyperliquidL1Action(input: HyperliquidSignL1ActionInput): HyperliquidExchangeSignature {
  const actionHash = getL1ActionHash(input.action, input.nonce, input.vaultAddress)
  const typedData = {
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
      chainId: 1337,
      verifyingContract: '0x0000000000000000000000000000000000000000',
    },
    message: {
      source: input.isTestnet ? 'b' : 'a',
      connectionId: actionHash,
    },
  }

  const signature = signTypedData(
    input.walletName,
    HYPERLIQUID_L1_CHAIN_ID,
    JSON.stringify(typedData),
    input.credential,
    input.vaultPath,
  ).signature

  return splitSignature(signature)
}

function getL1ActionHash(action: Record<string, unknown>, nonce: number, vaultAddress?: string): string {
  const msgpackBytes = Uint8Array.from(encode(action))
  const nonceBytes = Buffer.alloc(8)
  nonceBytes.writeBigUInt64BE(BigInt(nonce))

  const chunks: Uint8Array[] = [msgpackBytes, Uint8Array.from(nonceBytes)]
  if (vaultAddress?.trim()) {
    chunks.push(Uint8Array.of(0x01), hexToBytes(stripHexPrefix(vaultAddress.toLowerCase())))
  } else {
    chunks.push(Uint8Array.of(0x00))
  }

  const hashBytes = Uint8Array.from(keccak_256(concatBytes(chunks)))
  return `0x${Buffer.from(hashBytes).toString('hex')}`
}

function splitSignature(signature: string): HyperliquidExchangeSignature {
  const normalized = stripHexPrefix(signature)
  if (normalized.length !== 130) {
    throw new Error('Unexpected signature length from tcx-core')
  }

  const rawV = Number.parseInt(normalized.slice(128, 130), 16)
  return {
    r: `0x${normalized.slice(0, 64)}`,
    s: `0x${normalized.slice(64, 128)}`,
    v: rawV < 27 ? rawV + 27 : rawV,
  }
}
