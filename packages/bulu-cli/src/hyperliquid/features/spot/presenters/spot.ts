import { formatTimestamp } from '../../../../core/time'
import type {
  FrontendOpenOrder,
  HistoricalOrder,
  ResolvedSpotOrder,
  SpotBalance,
  SpotMeta,
  UserFill,
} from '../../../domain/types'
import type { TableView } from '../../../shared/view'
import type { SubmittedOrderStatusRow } from '../../perps/presenters/perps'

export interface SpotOrderResult {
  walletName: string
  pair: string
  side: 'buy' | 'sell'
  order: ResolvedSpotOrder
  statuses: SubmittedOrderStatusRow[]
}

export interface SpotOrdersResult {
  walletName: string
  user: string
  orders: FrontendOpenOrder[]
}

export interface SpotHistoryResult {
  walletName: string
  user: string
  entries: HistoricalOrder[]
}

export interface SpotFillsResult {
  walletName: string
  user: string
  fills: UserFill[]
}

export interface SpotPositionsResult {
  walletName: string
  user: string
  balances: SpotBalance[]
}

export interface SpotCancelResult {
  walletName: string
  user: string
  orders: FrontendOpenOrder[]
}

export interface SpotPairsResult {
  meta: SpotMeta
  contexts: Array<Record<string, unknown>>
}

function resolveSpotSide(side: FrontendOpenOrder['side'] | UserFill['side']): 'buy' | 'sell' {
  return side === 'B' ? 'buy' : 'sell'
}

function formatTif(tif: string, isTrigger: boolean): string {
  if (isTrigger) return `trigger (${tif})`
  return tif
}

export function presentSpotOrderResult(result: SpotOrderResult): TableView {
  return {
    kind: 'table',
    rows: result.statuses,
    table: {
      columns: ['orderIndex', 'result'],
      title: `Spot Order | ${result.walletName} | ${result.pair} ${result.side.toUpperCase()} ${result.order.size} @ ${result.order.price}`,
    },
  }
}

export function presentSpotOrders(result: SpotOrdersResult): TableView {
  return {
    kind: 'table',
    rows: result.orders.map((order) => ({
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
      timestamp: formatTimestamp(order.timestamp),
    })),
    table: {
      columns: [
        'pair',
        'side',
        'size',
        'origSize',
        'limitPx',
        'tif',
        'triggerPx',
        'reduceOnly',
        'oid',
        'cloid',
        'timestamp',
      ],
      title: `Open Spot Orders | ${result.walletName} (${result.user})`,
    },
  }
}

export function presentSpotHistory(result: SpotHistoryResult): TableView {
  return {
    kind: 'table',
    rows: result.entries.map((entry) => ({
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
    })),
    table: {
      columns: [
        'pair',
        'status',
        'side',
        'size',
        'origSize',
        'limitPx',
        'tif',
        'reduceOnly',
        'oid',
        'cloid',
        'statusTimestamp',
      ],
      title: `Spot Order History | ${result.walletName} (${result.user})`,
    },
  }
}

export function presentSpotFills(result: SpotFillsResult): TableView {
  return {
    kind: 'table',
    rows: result.fills.map((fill) => ({
      time: formatTimestamp(fill.time),
      pair: fill.coin,
      dir: fill.dir ?? 'N/A',
      side: resolveSpotSide(fill.side),
      size: fill.sz,
      price: fill.px,
      fee: fill.fee ?? 'N/A',
      closedPnl: fill.closedPnl ?? 'N/A',
      oid: fill.oid,
    })),
    table: {
      columns: ['time', 'pair', 'dir', 'side', 'size', 'price', 'fee', 'closedPnl', 'oid'],
      title: `Spot Fills | ${result.walletName} (${result.user})`,
    },
  }
}

export function presentSpotPositions(result: SpotPositionsResult): TableView {
  return {
    kind: 'table',
    rows: result.balances.map((balance) => ({
      coin: balance.coin,
      total: balance.total,
      hold: balance.hold,
      entryNtl: balance.entryNtl,
    })),
    table: {
      columns: ['coin', 'total', 'hold', 'entryNtl'],
      title: `Spot Balances | ${result.walletName} (${result.user})`,
    },
  }
}

export function presentSpotCancel(result: SpotCancelResult): TableView {
  return {
    kind: 'table',
    rows: result.orders.map((order) => ({
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
      timestamp: formatTimestamp(order.timestamp),
    })),
    table: {
      columns: [
        'pair',
        'side',
        'size',
        'origSize',
        'limitPx',
        'tif',
        'triggerPx',
        'reduceOnly',
        'oid',
        'cloid',
        'timestamp',
      ],
      title: `Canceled Spot Orders | ${result.walletName} (${result.user})`,
    },
  }
}

export function presentSpotPairs(result: SpotPairsResult): TableView {
  const tokenByIndex = new Map(result.meta.tokens.map((token) => [token.index, token]))

  return {
    kind: 'table',
    rows: result.meta.universe.map((pairMeta, idx) => {
      const [baseIndex, quoteIndex] = pairMeta.tokens
      const context = result.contexts[idx] ?? {}
      return {
        pair: pairMeta.name,
        base: tokenByIndex.get(baseIndex)?.name ?? String(baseIndex),
        quote: tokenByIndex.get(quoteIndex)?.name ?? String(quoteIndex),
        assetId: 10_000 + pairMeta.index,
        markPx: String(context.markPx ?? 'N/A'),
        midPx: String(context.midPx ?? 'N/A'),
        dayNtlVlm: String(context.dayNtlVlm ?? 'N/A'),
        canonical: pairMeta.isCanonical,
      }
    }),
    table: {
      columns: ['pair', 'base', 'quote', 'assetId', 'markPx', 'midPx', 'dayNtlVlm', 'canonical'],
      title: 'Hyperliquid Spot Pairs',
    },
  }
}
