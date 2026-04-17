export interface AssetMeta {
  name: string
  szDecimals: number
  maxLeverage: number
  [key: string]: unknown
}

export interface AssetCtx {
  funding?: string
  openInterest?: string
  prevDayPx?: string
  dayNtlVlm?: string
  premium?: string
  oraclePx?: string
  markPx?: string
  midPx?: string
  impactPxs?: string[]
  dayBaseVlm?: string
  [key: string]: unknown
}

export interface Candle {
  t: number
  T: number
  s: string
  i: string
  o: string
  c: string
  h: string
  l: string
  v: string
  n: number
}

export interface PerpPosition {
  coin: string
  szi: string
  entryPx?: string
  positionValue: string
  unrealizedPnl: string
  leverage: { type: 'cross'; value: number } | { type: 'isolated'; value: number; rawUsd: string }
  liquidationPx?: string
  marginUsed: string
  returnOnEquity: string
}

export interface AssetPosition {
  type: 'oneWay'
  position: PerpPosition
}

export interface MarginSummary {
  accountValue: string
  totalMarginUsed: string
  totalNtlPos: string
  totalRawUsd: string
}

export interface ClearinghouseState {
  assetPositions: AssetPosition[]
  crossMaintenanceMarginUsed: string
  crossMarginSummary: MarginSummary
  marginSummary: MarginSummary
  time: number
}

export interface SpotBalance {
  coin: string
  total: string
  hold: string
  entryNtl: string
}

export interface SpotClearinghouseState {
  balances: SpotBalance[]
}

export interface OpenOrder {
  coin: string
  side: 'A' | 'B'
  limitPx: string
  sz: string
  oid: number
  timestamp: number
  origSz: string
  reduceOnly: boolean
  orderType: string
  tif: string
  triggerCondition?: string
  isTrigger: boolean
  triggerPx?: string
}

export interface ExchangeSignature {
  r: `0x${string}`
  s: `0x${string}`
  v: number
}

export type OrderSide = 'long' | 'short'

export type OrderTimeInForce = 'Alo' | 'Ioc' | 'Gtc' | 'FrontendMarket'

export interface OrderRequestBody {
  action: {
    type: 'order'
    orders: Array<{
      a: number
      b: boolean
      p: string
      s: string
      r: boolean
      t: { limit: { tif: string } } | { trigger: { isMarket: boolean; triggerPx: string; tpsl: 'tp' | 'sl' } }
      c?: `0x${string}`
    }>
    grouping: 'na' | 'normalTpsl' | 'positionTpsl'
    builder?: {
      b: `0x${string}`
      f: number
    }
  }
  nonce: number
  signature: ExchangeSignature
  vaultAddress?: `0x${string}`
  expiresAfter?: number
}

export interface OrderResponse {
  status: 'ok'
  response: {
    type: 'order'
    data: {
      statuses: Array<
        | { resting: { oid: number; cloid?: `0x${string}` } }
        | { filled: { totalSz: string; avgPx: string; oid: number; cloid?: `0x${string}` } }
        | { error: string }
        | 'waitingForFill'
        | 'waitingForTrigger'
      >
    }
  }
}

export type OrderStatus = OrderResponse['response']['data']['statuses'][number]

export interface HyperliquidMarketAsset {
  assetIndex: number
  meta: AssetMeta
  context?: AssetCtx
}

export interface ResolvedPerpOrder {
  action: OrderRequestBody['action']
  assetIndex: number
  side: OrderSide
  size: string
  price: string
  reduceOnly: boolean
  tif: OrderTimeInForce
  market: HyperliquidMarketAsset
}
