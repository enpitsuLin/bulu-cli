import { formatTimestamp } from '../../../../core/time'
import { formatOrderStatus } from '../../../domain/format'
import { resolveOrderSide } from '../../../domain/orders/resolve'
import type {
  FrontendOpenOrder,
  HistoricalOrder,
  HyperliquidOrderWire,
  OrderResponse,
  OrderStatusInfo,
  PerpPosition,
  ResolvedPerpOrder,
  UserFill,
} from '../../../domain/types'
import type { DataView, TableView } from '../../../shared/view'

export interface SubmittedOrderStatusRow extends Record<string, unknown> {
  orderIndex: number
  result: string
}

export interface PerpOrderResult {
  walletName: string
  coin: string
  order: ResolvedPerpOrder
  statuses: SubmittedOrderStatusRow[]
}

export interface PerpOrdersResult {
  walletName: string
  user: string
  orders: FrontendOpenOrder[]
}

export interface PerpHistoryResult {
  walletName: string
  user: string
  entries: HistoricalOrder[]
}

export interface PerpFillsResult {
  walletName: string
  user: string
  fills: UserFill[]
}

export interface PerpPositionsResult {
  walletName: string
  user: string
  positions: PerpPosition[]
}

export interface PerpStatusResult {
  walletName: string
  user: string
  response: OrderStatusInfo
}

export interface PerpCancelResult {
  walletName: string
  user: string
  orders: FrontendOpenOrder[]
}

export interface PerpModifyResult {
  walletName: string
  user: string
  currentOrder: FrontendOpenOrder
  wire: HyperliquidOrderWire
}

export interface UpdatedPerpLeverageResult {
  walletName: string
  user: string
  coin: string
  leverage: number
  isolated: boolean
}

export interface UpdatedPerpMarginResult {
  walletName: string
  user: string
  coin: string
  delta: string
  ntli: number
}

export interface ScheduledCancelResult {
  walletName: string
  user: string
  cleared: boolean
  scheduledTime?: number
}

export function mapSubmittedStatuses(response: OrderResponse): SubmittedOrderStatusRow[] {
  return response.response.data.statuses.map((status, idx) => ({
    orderIndex: idx + 1,
    result: formatOrderStatus(status),
  }))
}

function formatTif(tif: string, isTrigger: boolean): string {
  if (isTrigger) return `trigger (${tif})`
  return tif
}

function formatLeverage(leverage: PerpPosition['leverage']): string {
  if (typeof leverage === 'object' && leverage !== null) {
    const label = leverage.type === 'cross' ? 'cross' : 'iso'
    return `${leverage.value}x (${label})`
  }
  return String(leverage)
}

export function presentPerpOrderResult(result: PerpOrderResult): TableView {
  const detail = result.order.isTrigger
    ? `${result.coin} ${String(result.order.triggerKind).toUpperCase()} ${result.order.size} trigger ${result.order.triggerPx} -> ${result.order.price}`
    : `${result.coin} ${result.order.side.toUpperCase()} ${result.order.size} @ ${result.order.price}`

  return {
    kind: 'table',
    rows: result.statuses,
    table: {
      columns: ['orderIndex', 'result'],
      title: `Perp Order | ${result.walletName} | ${detail}`,
    },
  }
}

export function presentPerpOrders(result: PerpOrdersResult): TableView {
  return {
    kind: 'table',
    rows: result.orders.map((order) => ({
      coin: order.coin,
      side: resolveOrderSide(order.side),
      size: order.sz,
      origSize: order.origSz,
      limitPx: order.limitPx,
      tif: formatTif(order.tif, order.isTrigger),
      triggerPx: order.triggerPx ?? 'N/A',
      positionTpsl: order.isPositionTpsl ?? false,
      reduceOnly: order.reduceOnly,
      oid: order.oid,
      cloid: order.cloid ?? 'N/A',
      timestamp: formatTimestamp(order.timestamp),
    })),
    table: {
      columns: [
        'coin',
        'side',
        'size',
        'origSize',
        'limitPx',
        'tif',
        'triggerPx',
        'positionTpsl',
        'reduceOnly',
        'oid',
        'cloid',
        'timestamp',
      ],
      title: `Open Perp Orders | ${result.walletName} (${result.user})`,
    },
  }
}

export function presentPerpHistory(result: PerpHistoryResult): TableView {
  return {
    kind: 'table',
    rows: result.entries.map((entry) => ({
      coin: entry.order.coin,
      status: entry.status,
      side: entry.order.side === 'B' ? 'long' : 'short',
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
        'coin',
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
      title: `Perp Order History | ${result.walletName} (${result.user})`,
    },
  }
}

export function presentPerpFills(result: PerpFillsResult): TableView {
  return {
    kind: 'table',
    rows: result.fills.map((fill) => ({
      time: formatTimestamp(fill.time),
      coin: fill.coin,
      dir: fill.dir ?? 'N/A',
      side: resolveOrderSide(fill.side),
      size: fill.sz,
      price: fill.px,
      fee: fill.fee ?? 'N/A',
      closedPnl: fill.closedPnl ?? 'N/A',
      oid: fill.oid,
    })),
    table: {
      columns: ['time', 'coin', 'dir', 'side', 'size', 'price', 'fee', 'closedPnl', 'oid'],
      title: `Perp Fills | ${result.walletName} (${result.user})`,
    },
  }
}

export function presentPerpPositions(result: PerpPositionsResult): TableView {
  return {
    kind: 'table',
    rows: result.positions.map((position) => ({
      coin: position.coin,
      size: position.szi,
      entryPx: position.entryPx ?? 'N/A',
      positionValue: position.positionValue,
      unrealizedPnl: position.unrealizedPnl,
      leverage: formatLeverage(position.leverage),
      liquidationPx: position.liquidationPx ?? 'N/A',
    })),
    table: {
      columns: ['coin', 'size', 'entryPx', 'positionValue', 'unrealizedPnl', 'leverage', 'liquidationPx'],
      title: `Perp Positions | ${result.walletName} (${result.user})`,
    },
  }
}

export function presentPerpStatus(result: PerpStatusResult): TableView | DataView {
  const response = result.response
  if (response && typeof response === 'object' && 'order' in response && response.order && 'status' in response) {
    return {
      kind: 'table',
      rows: [
        {
          coin: response.order.coin,
          status: String(response.status),
          side: resolveOrderSide(response.order.side),
          size: response.order.sz,
          limitPx: response.order.limitPx,
          isTrigger: response.order.isTrigger,
          reduceOnly: response.order.reduceOnly,
          oid: response.order.oid,
          cloid: response.order.cloid ?? 'N/A',
          statusTimestamp: 'statusTimestamp' in response ? formatTimestamp(Number(response.statusTimestamp)) : 'N/A',
        },
      ],
      table: {
        columns: [
          'coin',
          'status',
          'side',
          'size',
          'limitPx',
          'isTrigger',
          'reduceOnly',
          'oid',
          'cloid',
          'statusTimestamp',
        ],
        title: `Perp Order Status | ${result.walletName} (${result.user})`,
      },
    }
  }

  return {
    kind: 'data',
    data: response,
  }
}

export function presentPerpCancel(result: PerpCancelResult): TableView {
  return {
    kind: 'table',
    rows: result.orders.map((order) => ({
      coin: order.coin,
      side: order.side === 'B' ? 'long' : 'short',
      size: order.sz,
      limitPx: order.limitPx,
      oid: order.oid,
      cloid: order.cloid ?? 'N/A',
    })),
    table: {
      columns: ['coin', 'side', 'size', 'limitPx', 'oid', 'cloid'],
      title: `Canceled Perp Orders | ${result.walletName} (${result.user})`,
    },
  }
}

export function presentPerpModify(result: PerpModifyResult): TableView {
  return {
    kind: 'table',
    rows: [
      {
        coin: result.currentOrder.coin,
        side: resolveOrderSide(result.currentOrder.side),
        size: result.wire.s,
        limitPx: result.wire.p,
        triggerPx: 'trigger' in result.wire.t ? result.wire.t.trigger.triggerPx : 'N/A',
        reduceOnly: result.wire.r,
        oid: result.currentOrder.oid,
        cloid: result.currentOrder.cloid ?? 'N/A',
      },
    ],
    table: {
      columns: ['coin', 'side', 'size', 'limitPx', 'triggerPx', 'reduceOnly', 'oid', 'cloid'],
      title: `Modified Perp Order | ${result.walletName} (${result.user})`,
    },
  }
}

export function presentUpdatedPerpLeverage(result: UpdatedPerpLeverageResult): TableView {
  return {
    kind: 'table',
    rows: [
      {
        coin: result.coin,
        leverage: result.leverage,
        mode: result.isolated ? 'isolated' : 'cross',
      },
    ],
    table: {
      columns: ['coin', 'leverage', 'mode'],
      title: `Updated Perp Leverage | ${result.walletName} (${result.user})`,
    },
  }
}

export function presentUpdatedPerpMargin(result: UpdatedPerpMarginResult): TableView {
  return {
    kind: 'table',
    rows: [
      {
        coin: result.coin,
        delta: result.delta,
        ntli: result.ntli,
      },
    ],
    table: {
      columns: ['coin', 'delta', 'ntli'],
      title: `Updated Isolated Margin | ${result.walletName} (${result.user})`,
    },
  }
}

export function presentScheduledCancel(result: ScheduledCancelResult): TableView {
  return {
    kind: 'table',
    rows: [
      {
        mode: result.cleared ? 'cleared' : 'scheduled',
        time: result.scheduledTime ?? 'N/A',
      },
    ],
    table: {
      columns: ['mode', 'time'],
      title: `Scheduled Cancel | ${result.walletName} (${result.user})`,
    },
  }
}
