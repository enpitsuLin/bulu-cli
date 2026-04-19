import { defineCommand } from 'citty'
import { marketBaseArgs } from '../../../core/hyperliquid/command'
import { fetchListItems } from '../../../core/hyperliquid/query'
import {
  formatSpotOpenOrderRow,
  loadSpotPairNameSetOrExit,
  resolveSpotUserContext,
} from '../../../core/hyperliquid/spot'
import { fetchFrontendOpenOrders, normalizeSpotPair, partitionEntriesBySpot } from '../../../protocols/hyperliquid'
import { withDefaultArgs } from '../../../core/args-def'
import { createOutput, resolveOutputOptions } from '../../../core/output'

export default defineCommand({
  meta: { name: 'orders', description: 'Show open spot orders' },
  args: withDefaultArgs({
    ...marketBaseArgs,
    pair: {
      type: 'string',
      description: 'Filter orders by exact Hyperliquid spot pair',
    },
  }),
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args))
    const { walletName, user } = resolveSpotUserContext(args, out)
    const spotPairs = await loadSpotPairNameSetOrExit(args.testnet, out)
    const pairFilter = args.pair ? normalizeSpotPair(String(args.pair)) : undefined

    const rows = await fetchListItems({
      out,
      fetchItems: async () => {
        const orders = await fetchFrontendOpenOrders(user, args.testnet)
        const { spot } = partitionEntriesBySpot(orders, spotPairs)
        return spot
      },
      filter: pairFilter ? (order) => order.coin === pairFilter : undefined,
      toRow: formatSpotOpenOrderRow,
    })

    out.table(rows, {
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
      title: `Open Spot Orders | ${walletName} (${user})`,
    })
  },
})
