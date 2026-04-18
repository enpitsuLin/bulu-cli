import { defineCommand } from 'citty'
import { fetchHistoricalOrders, fetchSpotMeta, partitionEntriesBySpot } from '../../../protocols/hyperliquid'
import type { HistoricalOrder } from '../../../protocols/hyperliquid'
import { createOutput, resolveOutputOptions } from '../../../core/output'
import { resolvePerpQueryArgs, resolvePerpUserContext } from './shared'
import { fetchListItems } from '../query-shared'
import { parseLimitArg } from './utils'
import { formatTimestamp } from '../../../core/time'

function mapPerpHistoryRow(entry: HistoricalOrder) {
  return {
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
  }
}

export default defineCommand({
  meta: { name: 'history', description: 'Show historical perp orders' },
  args: resolvePerpQueryArgs({
    coin: {
      type: 'string',
      description: 'Filter order history by perp symbol',
    },
    status: {
      type: 'string',
      description: 'Filter order history by order status',
    },
    limit: {
      type: 'string',
      description: 'Maximum number of rows to show',
      default: '50',
    },
  }),
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args))
    const { walletName, user } = resolvePerpUserContext(args, out)
    const coin = args.coin ? String(args.coin).toUpperCase() : undefined
    const status = args.status ? String(args.status).toLowerCase() : undefined

    const limit = parseLimitArg(args.limit ? String(args.limit) : undefined)

    const rows = await fetchListItems({
      out,
      fetchItems: async () => {
        const [history, spotMeta] = await Promise.all([
          fetchHistoricalOrders(user, args.testnet),
          fetchSpotMeta(args.testnet),
        ])
        const mapped = history.map((entry) => ({ coin: entry.order.coin, entry }))
        const { perps } = partitionEntriesBySpot(mapped, spotMeta)
        return perps.map(({ entry }) => entry)
      },
      filter: (entry) => {
        if (coin && entry.order.coin !== coin) return false
        if (status && entry.status.toLowerCase() !== status) return false
        return true
      },
      limit,
      toRow: mapPerpHistoryRow,
    })

    out.table(rows, {
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
      title: `Perp Order History | ${walletName} (${user})`,
    })
  },
})
