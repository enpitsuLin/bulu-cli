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
