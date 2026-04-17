import { defineCommand } from 'citty'
import { fetchFrontendOpenOrders, normalizeSpotPair, partitionEntriesBySpot } from '../../../protocols/hyperliquid'
import { loadSpotPairNameSetOrExit, resolveSpotOutput, resolveSpotQueryArgs, resolveSpotUserContext } from './shared'
import { formatSpotOpenOrderRows, mapSpotOpenOrders } from './utils'

export default defineCommand({
  meta: { name: 'orders', description: 'Show open spot orders' },
  args: resolveSpotQueryArgs({
    pair: {
      type: 'string',
      description: 'Filter orders by exact Hyperliquid spot pair',
    },
  }),
  async run({ args }) {
    const out = resolveSpotOutput(args)
    const { walletName, user } = resolveSpotUserContext(args, out)
    const spotPairs = await loadSpotPairNameSetOrExit(args.testnet, out)
    const pairFilter = args.pair ? normalizeSpotPair(String(args.pair)) : undefined

    let orders
    try {
      orders = await fetchFrontendOpenOrders(user, args.testnet)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      out.warn(`Failed to fetch open orders: ${message}`)
      process.exit(1)
    }

    const { spot } = partitionEntriesBySpot(orders, spotPairs)
    const filtered = pairFilter ? spot.filter((order) => order.coin === pairFilter) : spot
    const rawRows = mapSpotOpenOrders(filtered)
    const displayRows = formatSpotOpenOrderRows(filtered)

    if (rawRows.length === 0) {
      if (args.json || args.format === 'json') {
        out.data({ wallet: walletName, user, orders: [] })
      } else {
        out.success(`No open spot orders for ${walletName} (${user})`)
      }
      return
    }

    if (args.json || args.format === 'json') {
      out.data({ wallet: walletName, user, orders: rawRows })
      return
    }

    if (args.format === 'csv') {
      out.data('pair,side,size,origSize,limitPx,tif,triggerPx,reduceOnly,oid,cloid,timestamp')
      for (const row of displayRows) {
        out.data(
          `${row.pair},${row.side},${row.size},${row.origSize},${row.limitPx},${row.tif},${row.triggerPx},${row.reduceOnly},${row.oid},${row.cloid},${row.timestamp}`,
        )
      }
      return
    }

    out.table(displayRows, {
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
