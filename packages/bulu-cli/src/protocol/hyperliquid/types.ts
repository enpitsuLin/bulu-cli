export interface HyperliquidConnection {
  apiBase: string
  isTestnet: boolean
}

export interface HyperliquidSubmitL1ActionInput {
  walletName: string
  credential: string
  vaultPath: string
  action: Record<string, unknown>
  nonce?: number
  vaultAddress?: string
}

export interface HyperliquidSubmitL1ActionResult<T> {
  nonce: number
  response: T
}

export interface HyperliquidSignL1ActionInput extends HyperliquidSubmitL1ActionInput {
  nonce: number
  isTestnet: boolean
}

export interface HyperliquidClient {
  apiBase: string
  isTestnet: boolean
  getSpotMeta(): Promise<HyperliquidSpotMeta>
  getSpotMetaAndAssetCtxs(): Promise<HyperliquidSpotMetaAndAssetCtxs>
  getSpotBalances(user: string): Promise<HyperliquidSpotBalancesResponse>
  getOpenOrders(user: string): Promise<HyperliquidOpenOrder[]>
  getOrderStatus(user: string, oid: number | string): Promise<HyperliquidOrderStatusResponse>
  getAllMids(): Promise<Record<string, string>>
  submitL1Action<T>(input: HyperliquidSubmitL1ActionInput): Promise<HyperliquidSubmitL1ActionResult<T>>
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

export interface HyperliquidSpotBalance {
  coin: string
  token: number | string
  total: string
  hold: string
  entryNtl: string
}

export interface HyperliquidSpotBalancesResponse {
  balances: HyperliquidSpotBalance[]
}

export interface HyperliquidOpenOrder {
  coin: string
  oid: number
  cloid?: string | null
  side: 'B' | 'A'
  orderType: string
  tif: string
  limitPx: string
  sz: string
  origSz: string
  reduceOnly: boolean
  timestamp: number
}

export interface HyperliquidOrderStatusEntry {
  status: string
  statusTimestamp: number
  order: HyperliquidOpenOrder
}

export interface HyperliquidOrderStatusResponse {
  status: string
  order?: HyperliquidOrderStatusEntry
}

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
