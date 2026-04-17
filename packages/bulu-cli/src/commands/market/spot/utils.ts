import { formatTimestamp } from '../../../core/time'
import type { FrontendOpenOrder, HistoricalOrder, UserFill } from '../../../protocols/hyperliquid'

export function resolveSpotSide(side: FrontendOpenOrder['side'] | UserFill['side']): 'buy' | 'sell' {
  return side === 'B' ? 'buy' : 'sell'
}

function formatTif(tif: string, isTrigger: boolean): string {
  if (isTrigger) return `trigger (${tif})`
  return tif
}

function mapSpotOpenOrder(order: FrontendOpenOrder) {
  return {
    pair: order.coin,
    side: resolveSpotSide(order.side),
    size: order.sz,
    origSize: order.origSz,
    limitPx: order.limitPx,
    tif: formatTif(order.tif, order.isTrigger),
    triggerPx: order.triggerPx ?? 'N/A',
    reduceOnly: order.reduceOnly,
    oid: order.oid,
    cloid: order.cloid ?? 'N/A',
    timestamp: order.timestamp,
  }
}

export function formatSpotOpenOrderRows(orders: FrontendOpenOrder[]) {
  return orders.map((order) => ({
    ...mapSpotOpenOrder(order),
    timestamp: formatTimestamp(order.timestamp),
  }))
}

export function mapSpotOpenOrders(orders: FrontendOpenOrder[]) {
  return orders.map(mapSpotOpenOrder)
}

export function formatSpotHistoryOrderRows(entries: HistoricalOrder[]) {
  return entries.map((entry) => ({
    pair: entry.order.coin,
    status: entry.status,
    side: resolveSpotSide(entry.order.side),
    size: entry.order.sz,
    origSize: entry.order.origSz,
    limitPx: entry.order.limitPx,
    tif: entry.order.tif,
    reduceOnly: entry.order.reduceOnly,
    oid: entry.order.oid,
    cloid: entry.order.cloid ?? 'N/A',
    statusTimestamp: formatTimestamp(entry.statusTimestamp),
  }))
}

export function formatSpotFillRows(fills: UserFill[]) {
  return fills.map((fill) => ({
    time: formatTimestamp(fill.time),
    pair: fill.coin,
    dir: fill.dir ?? 'N/A',
    side: resolveSpotSide(fill.side),
    size: fill.sz,
    price: fill.px,
    fee: fill.fee ?? 'N/A',
    closedPnl: fill.closedPnl ?? 'N/A',
    oid: fill.oid,
  }))
}
