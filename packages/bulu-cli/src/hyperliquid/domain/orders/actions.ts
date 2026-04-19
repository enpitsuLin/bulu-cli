import type {
  ExchangeCancelAction,
  ExchangeCancelByCloidAction,
  ExchangeModifyAction,
  ExchangeOrderAction,
  ExchangeScheduleCancelAction,
  ExchangeUpdateIsolatedMarginAction,
  ExchangeUpdateLeverageAction,
  HyperliquidOrderWire,
  OrderGrouping,
  OrderTimeInForce,
  TriggerOrderKind,
} from '../types'

export function buildOrderWire(args: {
  assetIndex: number
  isBuy: boolean
  size: string
  price: string
  reduceOnly: boolean
  tif?: OrderTimeInForce
  trigger?: { isMarket: boolean; triggerPx: string; tpsl: TriggerOrderKind }
  cloid?: `0x${string}`
}): HyperliquidOrderWire {
  const { assetIndex, isBuy, size, price, reduceOnly, tif, trigger, cloid } = args
  return {
    a: assetIndex,
    b: isBuy,
    p: price,
    s: size,
    r: reduceOnly,
    t: trigger ? { trigger } : { limit: { tif: tif ?? 'Gtc' } },
    c: cloid,
  }
}

export function buildOrderAction(args: {
  orders: HyperliquidOrderWire[]
  grouping?: OrderGrouping
}): ExchangeOrderAction {
  const { orders, grouping = 'na' } = args
  return {
    type: 'order',
    orders,
    grouping,
  }
}

export function buildCancelAction(cancels: ExchangeCancelAction['cancels']): ExchangeCancelAction {
  return { type: 'cancel', cancels }
}

export function buildCancelByCloidAction(cancels: ExchangeCancelByCloidAction['cancels']): ExchangeCancelByCloidAction {
  return { type: 'cancelByCloid', cancels }
}

export function buildModifyAction(args: {
  oid: number | `0x${string}`
  order: HyperliquidOrderWire
}): ExchangeModifyAction {
  return {
    type: 'modify',
    oid: args.oid,
    order: args.order,
  }
}

export function buildUpdateLeverageAction(args: {
  asset: number
  leverage: number
  isCross: boolean
}): ExchangeUpdateLeverageAction {
  return {
    type: 'updateLeverage',
    asset: args.asset,
    leverage: args.leverage,
    isCross: args.isCross,
  }
}

export function buildUpdateIsolatedMarginAction(args: {
  asset: number
  ntli: number
  isBuy?: boolean
}): ExchangeUpdateIsolatedMarginAction {
  return {
    type: 'updateIsolatedMargin',
    asset: args.asset,
    isBuy: args.isBuy ?? true,
    ntli: args.ntli,
  }
}

export function buildScheduleCancelAction(time?: number): ExchangeScheduleCancelAction {
  return time === undefined ? { type: 'scheduleCancel' } : { type: 'scheduleCancel', time }
}
