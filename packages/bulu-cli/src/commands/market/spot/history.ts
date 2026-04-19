import { defineCommand } from 'citty'
import { parseLimitArg } from '../../../core/hyperliquid/args'
import { marketBaseArgs } from '../../../core/hyperliquid/command'
import { fetchListItems } from '../../../core/hyperliquid/query'
import {
  formatSpotHistoryOrderRow,
  loadSpotPairNameSetOrExit,
  resolveSpotUserContext,
} from '../../../core/hyperliquid/spot'
import { fetchHistoricalOrders, normalizeSpotPair, partitionEntriesBySpot } from '../../../protocols/hyperliquid'
import { withDefaultArgs } from '../../../core/args-def'
import { createOutput, resolveOutputOptions } from '../../../core/output'

export default defineCommand({
  meta: { name: 'history', description: 'Show historical spot orders' },
  args: withDefaultArgs({
    ...marketBaseArgs,
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

    const rows = await fetchListItems({
      out,
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
      toRow: formatSpotHistoryOrderRow,
    })

    out.table(rows, {
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
    })
  },
})
