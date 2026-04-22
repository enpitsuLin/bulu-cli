import { getWallet, signTypedData } from '@bulu-cli/tcx-core'
import { encode } from '@msgpack/msgpack'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { ofetch } from 'ofetch'

export const HYPERLIQUID_MAINNET_API_URL = 'https://api.hyperliquid.xyz'
export const HYPERLIQUID_TESTNET_API_URL = 'https://api.hyperliquid-testnet.xyz'
export const HYPERLIQUID_L1_CHAIN_ID = 'eip155:1337'

export interface HyperliquidConnection {
  apiBase: string
  isTestnet: boolean
}

export interface HyperliquidExchangeSignature {
  r: string
  s: string
  v: number
}

export interface HyperliquidSpotToken {
  name: string
  szDecimals: number
  weiDecimals: number
  index: number
  tokenId: string
  isCanonical: boolean
  evmContract?: string | null
  fullName?: string | null
}

export interface HyperliquidSpotUniverseEntry {
  name: string
  tokens: [number, number]
  index: number
  isCanonical: boolean
}

export interface HyperliquidSpotMeta {
  tokens: HyperliquidSpotToken[]
  universe: HyperliquidSpotUniverseEntry[]
}

export interface HyperliquidSpotAssetContext {
  dayNtlVlm: string
  markPx: string
  midPx: string | null
  prevDayPx: string
  coin?: string
  circulatingSupply?: string
}

export type HyperliquidSpotMetaAndAssetCtxs = [HyperliquidSpotMeta, HyperliquidSpotAssetContext[]]

export interface HyperliquidResolvedSpotMarket {
  asset: number
  canonicalName: string
  displayName: string
  index: number
  isCanonical: boolean
  baseToken: HyperliquidSpotToken
  quoteToken: HyperliquidSpotToken
  szDecimals: number
}

export interface HyperliquidSpotMarketLookup {
  markets: HyperliquidResolvedSpotMarket[]
  byCanonical: Map<string, HyperliquidResolvedSpotMarket>
  aliases: Map<string, HyperliquidResolvedSpotMarket>
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

export async function postHyperliquidInfo<T>(apiBase: string, body: Record<string, unknown>): Promise<T> {
  return postHyperliquid<T>(apiBase, '/info', body)
}

export async function postHyperliquidExchange<T>(apiBase: string, body: Record<string, unknown>): Promise<T> {
  return postHyperliquid<T>(apiBase, '/exchange', body)
}

async function postHyperliquid<T>(apiBase: string, path: string, body: Record<string, unknown>): Promise<T> {
  try {
    return await ofetch<T>(`${normalizeApiBase(apiBase)}${path}`, {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  } catch (error) {
    let message = 'Unknown error'

    if (error instanceof Error) {
      message = error.message
      if ('data' in error && error.data != null) {
        const data = error.data
        message = typeof data === 'string' ? data : JSON.stringify(data)
      }
    }

    throw new Error(`Hyperliquid request failed: ${message}`)
  }
}

export async function fetchSpotMeta(apiBase: string): Promise<HyperliquidSpotMeta> {
  return postHyperliquidInfo<HyperliquidSpotMeta>(apiBase, { type: 'spotMeta' })
}

export async function fetchSpotMetaAndAssetCtxs(apiBase: string): Promise<HyperliquidSpotMetaAndAssetCtxs> {
  return postHyperliquidInfo<HyperliquidSpotMetaAndAssetCtxs>(apiBase, { type: 'spotMetaAndAssetCtxs' })
}

export async function fetchSpotBalances(apiBase: string, user: string): Promise<{ balances: any[] }> {
  return postHyperliquidInfo<{ balances: any[] }>(apiBase, {
    type: 'spotClearinghouseState',
    user: user.toLowerCase(),
  })
}

export async function fetchOpenOrders(apiBase: string, user: string): Promise<any[]> {
  return postHyperliquidInfo<any[]>(apiBase, {
    type: 'frontendOpenOrders',
    user: user.toLowerCase(),
    dex: '',
  })
}

export async function fetchOrderStatus(
  apiBase: string,
  user: string,
  oid: number | string,
): Promise<Record<string, unknown>> {
  return postHyperliquidInfo<Record<string, unknown>>(apiBase, {
    type: 'orderStatus',
    user: user.toLowerCase(),
    oid,
  })
}

export async function fetchAllMids(apiBase: string): Promise<Record<string, string>> {
  return postHyperliquidInfo<Record<string, string>>(apiBase, {
    type: 'allMids',
    dex: '',
  })
}

export function buildSpotMarketLookup(meta: HyperliquidSpotMeta): HyperliquidSpotMarketLookup {
  const tokenByIndex = new Map(meta.tokens.map((token) => [token.index, token]))
  const byCanonical = new Map<string, HyperliquidResolvedSpotMarket>()
  const aliases = new Map<string, HyperliquidResolvedSpotMarket>()
  const markets = meta.universe.map((entry) => {
    const [baseIndex, quoteIndex] = entry.tokens
    const baseToken = tokenByIndex.get(baseIndex)
    const quoteToken = tokenByIndex.get(quoteIndex)

    if (!baseToken || !quoteToken) {
      throw new Error(`Spot market "${entry.name}" references unknown token indexes`)
    }

    const displayName = `${baseToken.name}/${quoteToken.name}`
    const market = {
      asset: 10000 + entry.index,
      canonicalName: entry.name,
      displayName,
      index: entry.index,
      isCanonical: entry.isCanonical,
      baseToken,
      quoteToken,
      szDecimals: baseToken.szDecimals,
    } satisfies HyperliquidResolvedSpotMarket

    byCanonical.set(entry.name.toUpperCase(), market)
    aliases.set(entry.name.toUpperCase(), market)
    aliases.set(displayName.toUpperCase(), market)

    return market
  })

  return {
    markets,
    byCanonical,
    aliases,
  }
}

export function resolveSpotMarket(meta: HyperliquidSpotMeta, input: string): HyperliquidResolvedSpotMarket {
  const key = input.trim().toUpperCase()
  if (!key) {
    throw new Error('Spot market is required')
  }

  const lookup = buildSpotMarketLookup(meta)
  const market = lookup.aliases.get(key)
  if (!market) {
    throw new Error(`Unknown Hyperliquid spot market "${input}"`)
  }

  return market
}

export function isSpotCoin(meta: HyperliquidSpotMeta, coin: string): boolean {
  return buildSpotMarketLookup(meta).byCanonical.has(coin.toUpperCase())
}

export function formatSpotCoin(meta: HyperliquidSpotMeta, coin: string): string {
  return buildSpotMarketLookup(meta).byCanonical.get(coin.toUpperCase())?.displayName ?? coin
}

export function resolveWalletAddress(walletName: string, vaultPath: string): string {
  const wallet = getWallet(walletName, vaultPath)
  const account = wallet.accounts.find((item) => item.chainId.startsWith('eip155:'))

  if (!account) {
    throw new Error(`Wallet "${walletName}" does not have an Ethereum account`)
  }

  return account.address.toLowerCase()
}

export function toHyperliquidWireValue(value: string | number): string {
  const normalized = String(value).trim()
  if (!normalized) {
    throw new Error('Numeric value is required')
  }

  if (!/^-?(?:\d+|\d+\.\d+|\.\d+)$/.test(normalized)) {
    throw new Error(`Invalid numeric value "${value}"`)
  }

  if (normalized.startsWith('.')) {
    return toHyperliquidWireValue(`0${normalized}`)
  }

  if (normalized.startsWith('-.')) {
    return toHyperliquidWireValue(normalized.replace('-.', '-0.'))
  }

  const sign = normalized.startsWith('-') ? '-' : ''
  const unsigned = sign ? normalized.slice(1) : normalized
  const [rawIntegerPart, rawFractionPart = ''] = unsigned.split('.')
  const integerPart = rawIntegerPart.replace(/^0+(?=\d)/, '') || '0'
  const fractionPart = rawFractionPart.replace(/0+$/, '')

  if (integerPart === '0' && !fractionPart) {
    return '0'
  }

  return fractionPart ? `${sign}${integerPart}.${fractionPart}` : `${sign}${integerPart}`
}

export function buildMarketPriceFromMid(
  midPrice: string,
  isBuy: boolean,
  slippage: string | number,
  szDecimals: number,
): string {
  const mid = Number(midPrice)
  const slip = Number(slippage)

  if (!Number.isFinite(mid) || mid <= 0) {
    throw new Error(`Cannot derive market price from mid "${midPrice}"`)
  }

  if (!Number.isFinite(slip) || slip < 0) {
    throw new Error(`Invalid slippage value "${slippage}"`)
  }

  const adjusted = mid * (isBuy ? 1 + slip : 1 - slip)
  const roundedToPrecision = Number(adjusted.toPrecision(5))
  const decimals = Math.max(0, 8 - szDecimals)
  return toHyperliquidWireValue(roundedToPrecision.toFixed(decimals))
}

export function signHyperliquidL1Action(input: {
  walletName: string
  credential: string
  vaultPath: string
  action: Record<string, unknown>
  nonce: number
  isTestnet: boolean
  vaultAddress?: string
}): HyperliquidExchangeSignature {
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
