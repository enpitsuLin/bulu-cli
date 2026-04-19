import { formatSize, normalizeDecimalInput } from '../format'
import { resolveMarketPrice } from '../market/pricing'
import { normalizeSpotPair } from '../market/spot'
import type {
  ClearinghouseState,
  FrontendOpenOrder,
  HyperliquidMarketAsset,
  HyperliquidSpotMarketAsset,
  OrderGrouping,
  OrderSide,
  OrderTimeInForce,
  ResolvedPerpOrder,
  ResolvedSpotOrder,
  SpotOrderSide,
  TriggerOrderKind,
} from '../types'
import { buildOrderAction, buildOrderWire } from './actions'
import { findPerpPosition } from './selectors'

interface ResolvedPerpOrderInput {
  isBuy: boolean
  size: string
  reduceOnly: boolean
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

export function resolveSpotOrder(args: {
  pair: string
  market: HyperliquidSpotMarketAsset
  side: SpotOrderSide
  size: string
  price?: string
}): ResolvedSpotOrder {
  const { pair, market, side, size, price } = args
  const normalizedPair = normalizeSpotPair(pair)
  if (market.meta.name !== normalizedPair) {
    throw new Error(`Market context does not match ${normalizedPair}`)
  }

  const normalizedSize = normalizeDecimalInput(size, 'size', { absolute: true })
  const normalizedPrice = price ? normalizeDecimalInput(price, 'price') : resolveMarketPrice(market.context)
  if (!normalizedPrice) {
    throw new Error(`Could not resolve a price for ${normalizedPair}`)
  }

  const formattedSize = formatSize(normalizedSize, market.baseToken.szDecimals)
  const tif: OrderTimeInForce = price ? 'Gtc' : 'FrontendMarket'
  const wire = buildOrderWire({
    assetIndex: market.assetIndex,
    isBuy: side === 'buy',
    size: formattedSize,
    price: normalizedPrice,
    reduceOnly: false,
    tif,
  })

  return {
    action: buildOrderAction({ orders: [wire], grouping: 'na' }),
    assetIndex: market.assetIndex,
    side,
    size: formattedSize,
    price: normalizedPrice,
    tif,
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
