import { AsyncLocalStorage } from 'node:async_hooks'
import { signTypedData } from '@bulu-cli/tcx-core'
import { encode } from '@msgpack/msgpack'
import { concat, hexToBytes, hexToNumber, keccak256, numberToHex, sliceHex } from 'viem'
import { defu } from 'defu'
import { ofetch } from 'ofetch'
import { createContext } from 'unctx'
import { useConfig } from '#/core/config'
import type {
  HyperliquidClient,
  HyperliquidExchangeSignature,
  HyperliquidFill,
  HyperliquidOpenOrder,
  HyperliquidOrderStatusResponse,
  HyperliquidSignL1ActionInput,
  HyperliquidSpotMeta,
  HyperliquidSpotBalancesResponse,
  HyperliquidSpotMetaAndAssetCtxs,
  HyperliquidSubmitL1ActionInput,
  HyperliquidSubmitUserActionInput,
  HyperliquidUserAction,
} from './types'

export const HYPERLIQUID_MAINNET_API_URL = 'https://api.hyperliquid.xyz'
export const HYPERLIQUID_TESTNET_API_URL = 'https://api.hyperliquid-testnet.xyz'
export const HYPERLIQUID_L1_CHAIN_ID = 'eip155:1337'
const ARBITRUM_MAINNET_CHAIN_ID = 42161
const ARBITRUM_TESTNET_CHAIN_ID = 421614

export const hyperliquidClientCtx = createContext<HyperliquidClient>({
  asyncContext: true,
  AsyncLocalStorage,
})

export function useHyperliquidClient(): HyperliquidClient {
  return hyperliquidClientCtx.use()
}

export class HyperliquidRequestError extends Error {
  readonly status?: number
  readonly data?: unknown

  constructor(input: { message: string; status?: number; data?: unknown; cause?: Error }) {
    super(`Hyperliquid request failed: ${input.message}`, input.cause ? { cause: input.cause } : undefined)
    this.name = 'HyperliquidRequestError'
    this.status = input.status
    this.data = input.data
  }
}

export interface CreateHyperliquidClientOptions {
  testnet: boolean
  retry?: number
  retryDelay?: number
  timeout?: number
}

function resolveApiBase(testnet: boolean): string {
  const config = useConfig()
  const apiBase = config.get('hyperliquid.apiBase')?.trim()
  if (apiBase) return apiBase
  if (testnet) return HYPERLIQUID_TESTNET_API_URL
  return HYPERLIQUID_MAINNET_API_URL
}

export function createHyperliquidClient(options: CreateHyperliquidClientOptions): HyperliquidClient {
  const { testnet } = options
  const apiBase = resolveApiBase(testnet)
  const config = useConfig()
  const resolved = defu(options, config.get('hyperliquid') ?? {}, {
    retry: 3,
    retryDelay: 200,
    timeout: 15000,
  })
  let spotMetaPromise: Promise<HyperliquidSpotMeta> | undefined
  let spotMetaAndAssetCtxsPromise: Promise<HyperliquidSpotMetaAndAssetCtxs> | undefined
  const request = ofetch.create({
    baseURL: apiBase,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    retry: resolved.retry,
    retryDelay: resolved.retryDelay,
    timeout: resolved.timeout,
    onRequestError({ error }) {
      throw toHyperliquidRequestError({
        error,
      })
    },
    onResponseError({ response }) {
      throw toHyperliquidRequestError({
        data: response._data,
        status: response.status,
        fallback: `${response.status} ${response.statusText}`.trim(),
      })
    },
  })

  return {
    apiBase: apiBase,
    isTestnet: testnet,
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
    async getUserFills(user: string) {
      return request<HyperliquidFill[]>('/info', {
        body: {
          type: 'userFills',
          user: user.toLowerCase(),
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
        isTestnet: testnet,
      })
      const { response } = await request<{ status: 'ok'; response: T }>('/exchange', {
        body: {
          action: input.action,
          nonce,
          signature,
        },
      })

      return { nonce, response }
    },
    async submitUserAction<T>(input: HyperliquidSubmitUserActionInput) {
      const nonce = input.nonce ?? Date.now()
      const signature = signHyperliquidUserAction({
        walletName: input.walletName,
        credential: input.credential,
        vaultPath: input.vaultPath,
        action: { ...input.action, nonce },
        nonce,
        isTestnet: testnet,
      })
      const { response } = await request<{ status: 'ok'; response: T }>('/exchange', {
        body: {
          action: { ...input.action, nonce },
          nonce,
          signature,
        },
      })

      return { nonce, response }
    },
  }
}

function toHyperliquidRequestError(input: {
  error?: unknown
  data?: unknown
  status?: number
  fallback?: string
}): HyperliquidRequestError {
  let message = input.fallback ?? 'Unknown error'

  if (input.error instanceof Error && input.error.message) {
    message = input.error.message
  }

  const data =
    input.data ??
    (input.error != null && typeof input.error === 'object' && 'data' in input.error ? input.error.data : undefined)

  if (data != null) {
    if (typeof data === 'object' && data !== null) {
      const dataObj = data as Record<string, unknown>
      if (dataObj.status === 'err' && typeof dataObj.response === 'string') {
        message = dataObj.response
      } else {
        message = JSON.stringify(data)
      }
    } else {
      message = String(data)
    }
  }

  if (input.status === 429) {
    const retryAfter =
      typeof data === 'object' && data !== null && typeof (data as Record<string, unknown>).retryAfter === 'number'
        ? (data as Record<string, unknown>).retryAfter
        : undefined
    message = retryAfter != null ? `Rate limited, retry after ${retryAfter}s: ${message}` : `Rate limited: ${message}`
  }

  return new HyperliquidRequestError({
    message,
    status: input.status,
    data,
    cause: input.error instanceof Error ? input.error : undefined,
  })
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

interface HyperliquidSignUserActionInput {
  walletName: string
  credential: string
  vaultPath: string
  action: HyperliquidUserAction
  nonce: number
  isTestnet: boolean
}

export function signHyperliquidUserAction(input: HyperliquidSignUserActionInput): HyperliquidExchangeSignature {
  const typedData = {
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      'HyperliquidTransaction:UsdClassTransfer': [
        { name: 'hyperliquidChain', type: 'string' },
        { name: 'signatureChainId', type: 'uint256' },
        { name: 'amount', type: 'string' },
        { name: 'toPerp', type: 'bool' },
        { name: 'nonce', type: 'uint64' },
      ],
    },
    primaryType: 'HyperliquidTransaction:UsdClassTransfer',
    domain: {
      name: 'HyperliquidSignTransaction',
      version: '1',
      chainId: input.isTestnet ? ARBITRUM_TESTNET_CHAIN_ID : ARBITRUM_MAINNET_CHAIN_ID,
      verifyingContract: '0x0000000000000000000000000000000000000000',
    },
    message: {
      hyperliquidChain: input.action.hyperliquidChain,
      signatureChainId: input.action.signatureChainId,
      amount: input.action.amount,
      toPerp: input.action.toPerp,
      nonce: input.nonce,
    },
  }

  const signature = signTypedData(
    input.walletName,
    input.isTestnet ? 'eip155:421614' : 'eip155:42161',
    JSON.stringify(typedData),
    input.credential,
    input.vaultPath,
  ).signature

  return splitSignature(signature)
}

function getL1ActionHash(action: Record<string, unknown>, nonce: number, vaultAddress?: string): string {
  const msgpackBytes = Uint8Array.from(encode(action))
  const nonceBytes = hexToBytes(numberToHex(BigInt(nonce), { size: 8 }))

  const chunks: Uint8Array[] = [msgpackBytes, nonceBytes]
  if (vaultAddress?.trim()) {
    chunks.push(new Uint8Array([0x01]), hexToBytes(vaultAddress.toLowerCase() as `0x${string}`))
  } else {
    chunks.push(new Uint8Array([0x00]))
  }

  return keccak256(concat(chunks))
}

function splitSignature(signature: string): HyperliquidExchangeSignature {
  const sig = signature as `0x${string}`
  if (sig.length !== 132) {
    throw new Error('Unexpected signature length from tcx-core')
  }

  const rawV = hexToNumber(sliceHex(sig, 64))
  return {
    r: sliceHex(sig, 0, 32),
    s: sliceHex(sig, 32, 64),
    v: rawV < 27 ? rawV + 27 : rawV,
  }
}
