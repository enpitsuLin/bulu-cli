import { formatTimestamp } from '../../../core/time'
import type { HistoricalOrder } from '../../../protocols/hyperliquid'
export { findOrderByIdentifier, parseLimitArg, parseTimeArg } from '../utils'

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
