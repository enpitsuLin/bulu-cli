import { formatTimestamp } from '../../../core/time'
import { parseOrderIdentifier } from '../../../protocols/hyperliquid'
import type { FrontendOpenOrder, HistoricalOrder } from '../../../protocols/hyperliquid'

export function parseTimeArg(value: string, label: string): number {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error(`${label} is required`)
  }

  if (/^\d+$/.test(trimmed)) {
    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed)) {
      throw new Error(`Invalid ${label}: ${value}`)
    }
    return trimmed.length >= 13 ? parsed : parsed * 1000
  }

  const parsed = Date.parse(trimmed)
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid ${label}: ${value}`)
  }
  return parsed
}

export function formatHistoryOrderRows(entries: HistoricalOrder[]) {
  return entries.map((entry) => ({
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
  }))
}

export function findOrderByIdentifier(
  orders: FrontendOpenOrder[],
  identifier: string | number | `0x${string}`,
): FrontendOpenOrder | undefined {
  const parsed = typeof identifier === 'string' ? parseOrderIdentifier(identifier) : identifier
  return orders.find((order) =>
    typeof parsed === 'string' ? order.cloid?.toLowerCase() === parsed.toLowerCase() : order.oid === parsed,
  )
}
