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
