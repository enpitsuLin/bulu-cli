import { defineCommand } from 'citty'
import { fetchHistoricalOrders, normalizeSpotPair, partitionEntriesBySpot } from '../../../protocols/hyperliquid'
import { parseLimitArg } from '../utils'
import { loadSpotPairNameSetOrExit, resolveSpotOutput, resolveSpotQueryArgs, resolveSpotUserContext } from './shared'
import { formatSpotHistoryOrderRows } from './utils'

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
    const out = resolveSpotOutput(args)
    const { walletName, user } = resolveSpotUserContext(args, out)
    const spotPairs = await loadSpotPairNameSetOrExit(args.testnet, out)
    const pairFilter = args.pair ? normalizeSpotPair(String(args.pair)) : undefined
    const status = args.status ? String(args.status).toLowerCase() : undefined

    let limit: number
    try {
      limit = parseLimitArg(args.limit ? String(args.limit) : undefined)
    } catch (error) {
      out.warn(error instanceof Error ? error.message : String(error))
      process.exit(1)
    }

    try {
      const history = await fetchHistoricalOrders(user, args.testnet)
      const { spot } = partitionEntriesBySpot(
        history.map((entry) => ({ coin: entry.order.coin, entry })),
        spotPairs,
      )
      const rows = formatSpotHistoryOrderRows(
        spot
          .map(({ entry }) => entry)
          .filter((entry) => !pairFilter || entry.order.coin === pairFilter)
          .filter((entry) => !status || entry.status.toLowerCase() === status)
          .slice(0, limit),
      )

      if (args.json || args.format === 'json') {
        out.data({ wallet: walletName, user, history: rows })
        return
      }

      if (rows.length === 0) {
        out.success(`No historical spot orders for ${walletName} (${user})`)
        return
      }

      if (args.format === 'csv') {
        out.data('pair,status,side,size,origSize,limitPx,tif,reduceOnly,oid,cloid,statusTimestamp')
        for (const row of rows) {
          out.data(
            `${row.pair},${row.status},${row.side},${row.size},${row.origSize},${row.limitPx},${row.tif},${row.reduceOnly},${row.oid},${row.cloid},${row.statusTimestamp}`,
          )
        }
        return
      }

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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      out.warn(`Failed to fetch historical orders: ${message}`)
      process.exit(1)
    }
  },
})
