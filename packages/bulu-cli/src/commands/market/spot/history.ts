import { defineCommand } from 'citty'
import { fetchHistoricalOrders, normalizeSpotPair, partitionEntriesBySpot } from '../../../protocols/hyperliquid'
import type { HistoricalOrder } from '../../../protocols/hyperliquid'
import { createOutput, resolveOutputOptions } from '../../../core/output'
import { loadSpotPairNameSetOrExit, resolveSpotQueryArgs, resolveSpotUserContext } from './shared'
import { runListCommand } from '../query-shared'
import { parseLimitArg } from '../utils'
import { formatTimestamp } from '../../../core/time'

function mapSpotHistoryRow(entry: HistoricalOrder) {
  return {
    pair: entry.order.coin,
    status: entry.status,
    side: entry.order.side === 'B' ? 'buy' : 'sell',
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
  meta: { name: 'history', description: 'Show historical spot orders' },
  args: resolveSpotQueryArgs({
    pair: {
      type: 'string',
      description: 'Filter order history by exact Hyperliquid spot pair',
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
    const { walletName, user } = resolveSpotUserContext(args, out)
    const spotPairs = await loadSpotPairNameSetOrExit(args.testnet, out)
    const pairFilter = args.pair ? normalizeSpotPair(String(args.pair)) : undefined
    const status = args.status ? String(args.status).toLowerCase() : undefined

    const limit = parseLimitArg(args.limit ? String(args.limit) : undefined)

    await runListCommand({
      out,
      args,
      walletName,
      user,
      fetchItems: async () => {
        const history = await fetchHistoricalOrders(user, args.testnet)
        const mapped = history.map((entry) => ({ coin: entry.order.coin, entry }))
        const { spot } = partitionEntriesBySpot(mapped, spotPairs)
        return spot.map(({ entry }) => entry)
      },
      filter: (entry) => {
        if (pairFilter && entry.order.coin !== pairFilter) return false
        if (status && entry.status.toLowerCase() !== status) return false
        return true
      },
      limit,
      toRow: mapSpotHistoryRow,
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
      title: `Spot Order History | ${walletName} (${user})`,
      emptyMessage: `No historical spot orders for ${walletName} (${user})`,
      dataKey: 'history',
    })
  },
})
