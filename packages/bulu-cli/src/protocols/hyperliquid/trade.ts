import { resolveMarketPrice } from './market'
import { formatSize, normalizeDecimalInput } from './format'
import type {
  AssetPosition,
  ClearinghouseState,
  HyperliquidMarketAsset,
  OrderRequestBody,
  OrderSide,
  OrderTimeInForce,
  ResolvedPerpOrder,
} from './types'

export function buildOrderAction(args: {
  assetIndex: number
  isBuy: boolean
  size: string
  price: string
  reduceOnly: boolean
  tif: OrderTimeInForce
}): OrderRequestBody['action'] {
  const { assetIndex, isBuy, size, price, reduceOnly, tif } = args
  return {
    type: 'order',
    orders: [
      {
        a: assetIndex,
        b: isBuy,
        p: price,
        s: size,
        r: reduceOnly,
        t: { limit: { tif } },
      },
    ],
    grouping: 'na',
  }
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
}): { isBuy: boolean; size: string; reduceOnly: true } {
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

function resolveOpenOrder(args: { requestedSide?: OrderSide; requestedSize?: string }): {
  isBuy: boolean
  size: string
  reduceOnly: false
} {
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

  return {
    action: buildOrderAction({
      assetIndex: market.assetIndex,
      isBuy: order.isBuy,
      size: formattedSize,
      price: normalizedPrice,
      reduceOnly: order.reduceOnly,
      tif,
    }),
    assetIndex: market.assetIndex,
    side: resolvedSide,
    size: formattedSize,
    price: normalizedPrice,
    reduceOnly: order.reduceOnly,
    tif,
    market,
  }
}
