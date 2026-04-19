import { defineCommand } from 'citty'
import { withDefaultArgs } from '../../../core/args-def'
import { marketBaseArgs } from '../../../core/hyperliquid/command'
import { fetchListItems } from '../../../core/hyperliquid/query'
import { formatPerpOpenOrderRow, resolvePerpUserContext } from '../../../core/hyperliquid/perps'
import { createOutput, resolveOutputOptions } from '../../../core/output'
import { fetchFrontendOpenOrders, fetchSpotMeta, partitionEntriesBySpot } from '../../../protocols/hyperliquid'

export default defineCommand({
  meta: { name: 'orders', description: 'Show open perp orders' },
  args: withDefaultArgs({
    ...marketBaseArgs,
    coin: {
      type: 'string',
      description: 'Filter orders by perp symbol',
    },
  }),
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args))
    const { walletName, user } = resolvePerpUserContext(args, out)
    const coinFilter = args.coin ? String(args.coin).toUpperCase() : undefined

    const rows = await fetchListItems({
      out,
      fetchItems: async () => {
        const [orders, spotMeta] = await Promise.all([
          fetchFrontendOpenOrders(user, args.testnet),
          fetchSpotMeta(args.testnet),
        ])
        const { perps } = partitionEntriesBySpot(orders, spotMeta)
        return perps
      },
      filter: coinFilter ? (order) => order.coin === coinFilter : undefined,
      toRow: formatPerpOpenOrderRow,
    })

    out.table(rows, {
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
      title: `Open Perp Orders | ${walletName} (${user})`,
    })
  },
})
