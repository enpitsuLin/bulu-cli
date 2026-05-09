export interface HyperliquidOrderWire {
  a: number
  b: boolean
  p: string
  s: string
  r: boolean
  t: { limit: { tif: 'Alo' | 'Ioc' | 'Gtc' } }
  c?: string
}

export type SpotOrderWire = HyperliquidOrderWire
export type PerpOrderWire = HyperliquidOrderWire

export type HyperliquidAction =
  | { type: 'order'; orders: HyperliquidOrderWire[]; grouping: 'na' }
  | { type: 'cancel'; cancels: Array<{ a: number; o: number }> }
  | { type: 'cancelByCloid'; cancels: Array<{ asset: number; cloid: string }> }
  | { type: 'modify'; oid: number | string; order: HyperliquidOrderWire }
  | { type: 'updateLeverage'; asset: number; isCross: boolean; leverage: number }
  | { type: 'updateIsolatedMargin'; asset: number; isBuy: boolean; ntli: number }

export interface HyperliquidSubmitL1ActionInput {
  walletName: string
  credential: string
  vaultPath: string
  action: HyperliquidAction
  nonce?: number
  vaultAddress?: string
}

export interface HyperliquidUsdClassTransferAction {
  type: 'usdClassTransfer'
  hyperliquidChain: 'Mainnet' | 'Testnet'
  signatureChainId: string
  amount: string
  toPerp: boolean
  nonce?: number
}

export type HyperliquidUserAction = HyperliquidUsdClassTransferAction

export interface HyperliquidSubmitUserActionInput {
  walletName: string
  credential: string
  vaultPath: string
  action: HyperliquidUserAction
  nonce?: number
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
  getPerpDexs(): Promise<HyperliquidPerpDexsResponse>
  getPerpMeta(dex?: string): Promise<HyperliquidPerpMeta>
  getPerpMetaAndAssetCtxs(dex?: string): Promise<HyperliquidPerpMetaAndAssetCtxs>
  getClearinghouseState(user: string, dex?: string): Promise<HyperliquidClearinghouseState>
  getSpotBalances(user: string): Promise<HyperliquidSpotBalancesResponse>
  getOpenOrders(user: string, dex?: string): Promise<HyperliquidOpenOrder[]>
  getUserFills(user: string, dex?: string): Promise<HyperliquidFill[]>
  getOrderStatus(user: string, oid: number | string): Promise<HyperliquidOrderStatusResponse>
  getAllMids(dex?: string): Promise<Record<string, string>>
  submitL1Action<T>(input: HyperliquidSubmitL1ActionInput): Promise<HyperliquidSubmitL1ActionResult<T>>
  submitUserAction<T>(input: HyperliquidSubmitUserActionInput): Promise<HyperliquidSubmitL1ActionResult<T>>
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

export interface HyperliquidPerpDex {
  name: string
  fullName?: string
  deployer?: string
  oracleUpdater?: string | null
  feeRecipient?: string | null
  assetToStreamingOiCap?: Array<[string, string]>
  assetToFundingMultiplier?: Array<[string, string]>
}

export type HyperliquidPerpDexsResponse = Array<HyperliquidPerpDex | null>

export interface HyperliquidPerpUniverseEntry {
  name: string
  szDecimals: number
  maxLeverage: number
  onlyIsolated?: boolean
  isDelisted?: boolean
  marginMode?: 'strictIsolated' | 'noCross' | string
  marginTableId?: number
}

export interface HyperliquidPerpMarginTier {
  lowerBound: string
  maxLeverage: number
}

export interface HyperliquidPerpMarginTable {
  description?: string
  marginTiers: HyperliquidPerpMarginTier[]
}

export interface HyperliquidPerpMeta {
  universe: HyperliquidPerpUniverseEntry[]
  marginTables: Array<[number, HyperliquidPerpMarginTable]>
  collateralToken?: number
}

export interface HyperliquidPerpAssetContext {
  dayNtlVlm: string
  funding: string
  impactPxs?: [string, string] | string[]
  markPx: string
  midPx: string | null
  openInterest: string
  oraclePx: string
  premium: string
  prevDayPx: string
  dayBaseVlm?: string
}

export type HyperliquidPerpMetaAndAssetCtxs = [HyperliquidPerpMeta, HyperliquidPerpAssetContext[]]

export interface HyperliquidMarginSummary {
  accountValue: string
  totalNtlPos: string
  totalRawUsd: string
  totalMarginUsed: string
}

export interface HyperliquidPerpPosition {
  coin: string
  szi: string
  leverage?: {
    type: 'cross' | 'isolated' | string
    value: number
    rawUsd?: string
  }
  entryPx: string
  positionValue: string
  unrealizedPnl: string
  returnOnEquity: string
  liquidationPx?: string | null
  marginUsed?: string
  maxLeverage?: number
  cumFunding?: {
    allTime: string
    sinceOpen: string
    sinceChange: string
  }
}

export interface HyperliquidAssetPosition {
  type: 'oneWay' | string
  position: HyperliquidPerpPosition
}

export interface HyperliquidClearinghouseState {
  marginSummary: HyperliquidMarginSummary
  crossMarginSummary: HyperliquidMarginSummary
  crossMaintenanceMarginUsed: string
  withdrawable: string
  assetPositions: HyperliquidAssetPosition[]
  time?: number
}

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

export interface HyperliquidPlaceOrderRestingStatus {
  resting: {
    oid: number
  }
}

export interface HyperliquidPlaceOrderFilledStatus {
  filled: {
    totalSz: string
    avgPx: string
    oid: number
  }
}

export interface HyperliquidPlaceOrderErrorStatus {
  error: string
}

export type HyperliquidPlaceOrderStatus =
  | HyperliquidPlaceOrderRestingStatus
  | HyperliquidPlaceOrderFilledStatus
  | HyperliquidPlaceOrderErrorStatus

export interface HyperliquidPlaceOrderResponse {
  type: 'order'
  data: {
    statuses: HyperliquidPlaceOrderStatus[]
  }
}

export interface HyperliquidCancelErrorStatus {
  error: string
}

export type HyperliquidCancelStatus = 'success' | HyperliquidCancelErrorStatus

export interface HyperliquidCancelResponse {
  type: 'cancel' | 'cancelByCloid'
  data: {
    statuses: HyperliquidCancelStatus[]
  }
}

export interface HyperliquidModifyResponse {
  type: 'modify'
  data: {
    status: string
  }
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

export interface HyperliquidResolvedPerpMarket {
  asset: number
  coin: string
  index: number
  maxLeverage: number
  szDecimals: number
  onlyIsolated: boolean
  isDelisted: boolean
  marginMode?: string
  marginTableId?: number
}

export interface HyperliquidPerpMarketLookup {
  markets: HyperliquidResolvedPerpMarket[]
  byCoin: Map<string, HyperliquidResolvedPerpMarket>
  aliases: Map<string, HyperliquidResolvedPerpMarket>
}

export interface HyperliquidFill {
  coin: string
  px: string
  sz: string
  side: 'A' | 'B'
  /** Unix timestamp in milliseconds */
  time: number
  startPosition: string
  dir: string
  closedPnl: string
  hash: string
  oid: number
  crossed: boolean
  fee: string
  feeToken: string
  tid: number
  builderFee?: string
  cloid?: string | null
  liquidation?: { liquidatedUser: string; markPx: string; method: string } | null
  twapId?: string | null
}
