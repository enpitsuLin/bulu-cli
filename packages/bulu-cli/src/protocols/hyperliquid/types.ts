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

export interface FrontendOpenOrder extends OpenOrder {
  cloid?: `0x${string}` | null
  children?: unknown[]
  isPositionTpsl?: boolean
}

export interface UserFill {
  closedPnl?: string
  coin: string
  crossed?: boolean
  dir?: string
  fee?: string
  feeToken?: string
  hash?: `0x${string}`
  oid: number
  px: string
  side: 'A' | 'B'
  startPosition?: string
  sz: string
  tid?: number
  time: number
  [key: string]: unknown
}

export interface HistoricalOrder {
  order: FrontendOpenOrder
  status: string
  statusTimestamp: number
}

export type OrderStatusInfo =
  | HistoricalOrder
  | { error: string }
  | {
      status?: string
      order?: FrontendOpenOrder
      statusTimestamp?: number
      [key: string]: unknown
    }
  | string
  | null

export interface ExchangeSignature {
  r: `0x${string}`
  s: `0x${string}`
  v: number
}

export type OrderSide = 'long' | 'short'

export type OrderTimeInForce = 'Alo' | 'Ioc' | 'Gtc' | 'FrontendMarket'

export type TriggerOrderKind = 'tp' | 'sl'

export type OrderGrouping = 'na' | 'normalTpsl' | 'positionTpsl'

export type HyperliquidOrderType =
  | { limit: { tif: string } }
  | { trigger: { isMarket: boolean; triggerPx: string; tpsl: TriggerOrderKind } }

export interface HyperliquidOrderWire {
  a: number
  b: boolean
  p: string
  s: string
  r: boolean
  t: HyperliquidOrderType
  c?: `0x${string}`
}

export interface ExchangeOrderAction {
  type: 'order'
  orders: HyperliquidOrderWire[]
  grouping: OrderGrouping
  builder?: {
    b: `0x${string}`
    f: number
  }
}

export interface ExchangeCancelAction {
  type: 'cancel'
  cancels: Array<{
    a: number
    o: number
  }>
}

export interface ExchangeCancelByCloidAction {
  type: 'cancelByCloid'
  cancels: Array<{
    asset: number
    cloid: `0x${string}`
  }>
}

export interface ExchangeModifyAction {
  type: 'modify'
  oid: number | `0x${string}`
  order: HyperliquidOrderWire
}

export interface ExchangeUpdateLeverageAction {
  type: 'updateLeverage'
  asset: number
  isCross: boolean
  leverage: number
}

export interface ExchangeUpdateIsolatedMarginAction {
  type: 'updateIsolatedMargin'
  asset: number
  isBuy: boolean
  ntli: number
}

export interface ExchangeScheduleCancelAction {
  type: 'scheduleCancel'
  time?: number
}

export type ExchangeAction =
  | ExchangeOrderAction
  | ExchangeCancelAction
  | ExchangeCancelByCloidAction
  | ExchangeModifyAction
  | ExchangeUpdateLeverageAction
  | ExchangeUpdateIsolatedMarginAction
  | ExchangeScheduleCancelAction

export interface ExchangeRequestBody<TAction extends ExchangeAction = ExchangeAction> {
  action: TAction
  nonce: number
  signature: ExchangeSignature
  vaultAddress?: `0x${string}`
  expiresAfter?: number
}

export type OrderRequestBody = ExchangeRequestBody<ExchangeOrderAction>

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

export interface DefaultExchangeResponse {
  status: 'ok'
  response: {
    type: 'default'
    [key: string]: unknown
  }
}

export interface HyperliquidMarketAsset {
  assetIndex: number
  meta: AssetMeta
  context?: AssetCtx
}

export interface ResolvedPerpOrder {
  action: ExchangeOrderAction
  assetIndex: number
  side: OrderSide
  size: string
  price: string
  reduceOnly: boolean
  tif?: OrderTimeInForce
  triggerPx?: string
  triggerKind?: TriggerOrderKind
  isTrigger: boolean
  grouping: OrderGrouping
  market: HyperliquidMarketAsset
}
