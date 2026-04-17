import { resolveMarketPrice } from './market'
import { formatSize, normalizeDecimalInput } from './format'
import type {
  AssetPosition,
  ClearinghouseState,
  ExchangeCancelAction,
  ExchangeCancelByCloidAction,
  ExchangeModifyAction,
  ExchangeOrderAction,
  ExchangeScheduleCancelAction,
  ExchangeUpdateIsolatedMarginAction,
  ExchangeUpdateLeverageAction,
  FrontendOpenOrder,
  HyperliquidMarketAsset,
  HyperliquidOrderWire,
  OrderGrouping,
  OrderSide,
  OrderTimeInForce,
  ResolvedPerpOrder,
  TriggerOrderKind,
} from './types'

interface ResolvedPerpOrderInput {
  isBuy: boolean
  size: string
  reduceOnly: boolean
}

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

export function findPerpPosition(
  coin: string,
  state: Pick<ClearinghouseState, 'assetPositions'>,
): AssetPosition | undefined {
  const normalizedCoin = coin.toUpperCase()
  return state.assetPositions.find((assetPosition) => assetPosition.position.coin === normalizedCoin)
}

function resolveCloseOrder(args: {
  coin: string
  requestedSize?: string
  state?: Pick<ClearinghouseState, 'assetPositions'>
}): ResolvedPerpOrderInput {
  const { coin, requestedSize, state } = args
  if (!state) {
    throw new Error(`Perp positions are required to close ${coin}`)
  }

  const position = findPerpPosition(coin, state)
  if (!position) {
    throw new Error(`No open position for ${coin}`)
  }

  const positionSize = parseFloat(position.position.szi)
  if (!Number.isFinite(positionSize) || positionSize === 0) {
    throw new Error(`Position size is zero for ${coin}`)
  }

  return {
    isBuy: positionSize < 0,
    size: normalizeDecimalInput(requestedSize ?? position.position.szi, 'size', { absolute: true }),
    reduceOnly: true,
  }
}

function resolveOpenOrder(args: { requestedSide?: OrderSide; requestedSize?: string }): ResolvedPerpOrderInput {
  const size = args.requestedSize
  if (!size) {
    throw new Error('Size is required when opening a position')
  }

  return {
    isBuy: (args.requestedSide ?? 'long') !== 'short',
    size: normalizeDecimalInput(size, 'size', { absolute: true }),
    reduceOnly: false,
  }
}

export function resolvePerpOrder(args: {
  coin: string
  market: HyperliquidMarketAsset
  side?: OrderSide
  size?: string
  price?: string
  close?: boolean
  state?: Pick<ClearinghouseState, 'assetPositions'>
}): ResolvedPerpOrder {
  const { coin, market, side, size, price, close = false, state } = args
  const normalizedCoin = coin.toUpperCase()
  if (market.meta.name !== normalizedCoin) {
    throw new Error(`Market context does not match ${normalizedCoin}`)
  }

  const order = close
    ? resolveCloseOrder({ coin: normalizedCoin, requestedSize: size, state })
    : resolveOpenOrder({ requestedSide: side, requestedSize: size })

  const normalizedPrice = price ? normalizeDecimalInput(price, 'price') : resolveMarketPrice(market.context)
  if (!normalizedPrice) {
    throw new Error(`Could not resolve a price for ${normalizedCoin}`)
  }

  const formattedSize = formatSize(order.size, market.meta.szDecimals)
  const tif: OrderTimeInForce = price ? 'Gtc' : 'FrontendMarket'
  const resolvedSide: OrderSide = order.isBuy ? 'long' : 'short'
  const wire = buildOrderWire({
    assetIndex: market.assetIndex,
    isBuy: order.isBuy,
    size: formattedSize,
    price: normalizedPrice,
    reduceOnly: order.reduceOnly,
    tif,
  })

  return {
    action: buildOrderAction({ orders: [wire], grouping: 'na' }),
    assetIndex: market.assetIndex,
    side: resolvedSide,
    size: formattedSize,
    price: normalizedPrice,
    reduceOnly: order.reduceOnly,
    tif,
    triggerPx: undefined,
    triggerKind: undefined,
    isTrigger: false,
    grouping: 'na',
    market,
  }
}

export function resolvePerpTpslOrder(args: {
  coin: string
  market: HyperliquidMarketAsset
  triggerPrice: string
  price?: string
  size?: string
  state?: Pick<ClearinghouseState, 'assetPositions'>
  tpsl: TriggerOrderKind
  grouping?: OrderGrouping
}): ResolvedPerpOrder {
  const { coin, market, triggerPrice, price, size, state, tpsl, grouping = 'positionTpsl' } = args
  const normalizedCoin = coin.toUpperCase()
  if (market.meta.name !== normalizedCoin) {
    throw new Error(`Market context does not match ${normalizedCoin}`)
  }

  const order = resolveCloseOrder({ coin: normalizedCoin, requestedSize: size, state })
  const normalizedTrigger = normalizeDecimalInput(triggerPrice, 'trigger price')
  const normalizedPrice = price ? normalizeDecimalInput(price, 'price') : normalizedTrigger
  const formattedSize = formatSize(order.size, market.meta.szDecimals)
  const resolvedSide: OrderSide = order.isBuy ? 'long' : 'short'
  const wire = buildOrderWire({
    assetIndex: market.assetIndex,
    isBuy: order.isBuy,
    size: formattedSize,
    price: normalizedPrice,
    reduceOnly: true,
    trigger: {
      isMarket: !price,
      triggerPx: normalizedTrigger,
      tpsl,
    },
  })

  return {
    action: buildOrderAction({ orders: [wire], grouping }),
    assetIndex: market.assetIndex,
    side: resolvedSide,
    size: formattedSize,
    price: normalizedPrice,
    reduceOnly: true,
    tif: undefined,
    triggerPx: normalizedTrigger,
    triggerKind: tpsl,
    isTrigger: true,
    grouping,
    market,
  }
}

export function parseOrderIdentifier(value: string): number | `0x${string}` {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('Order id is required')
  }
  if (/^0x[0-9a-fA-F]{32}$/.test(trimmed)) {
    return trimmed.toLowerCase() as `0x${string}`
  }
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`Invalid order id: ${value}`)
  }

  const parsed = Number(trimmed)
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Order id exceeds JavaScript safe integer range: ${value}`)
  }
  return parsed
}

export function isCloid(value: number | string): value is `0x${string}` {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{32}$/.test(value)
}

export function resolveOrderSide(side: FrontendOpenOrder['side']): OrderSide {
  return side === 'B' ? 'long' : 'short'
}

export function resolveOrderTimeInForce(order: Pick<FrontendOpenOrder, 'tif'>): OrderTimeInForce {
  const normalized = order.tif.toLowerCase()
  if (normalized === 'alo') return 'Alo'
  if (normalized === 'ioc') return 'Ioc'
  if (normalized === 'gtc') return 'Gtc'
  if (normalized === 'frontendmarket') return 'FrontendMarket'
  throw new Error(`Unsupported time-in-force: ${order.tif}`)
}

export function resolveTriggerKindFromOrder(
  order: Pick<FrontendOpenOrder, 'triggerCondition' | 'orderType'>,
  fallback?: TriggerOrderKind,
): TriggerOrderKind {
  if (fallback) return fallback

  const triggerCondition = order.triggerCondition?.toLowerCase()
  if (triggerCondition?.includes('tp') || triggerCondition?.includes('take')) return 'tp'
  if (triggerCondition?.includes('sl') || triggerCondition?.includes('stop')) return 'sl'

  const orderType = order.orderType.toLowerCase()
  if (orderType.includes('take')) return 'tp'
  if (orderType.includes('stop')) return 'sl'

  throw new Error('Could not infer TP/SL kind for trigger order; pass --tp or --sl explicitly')
}
