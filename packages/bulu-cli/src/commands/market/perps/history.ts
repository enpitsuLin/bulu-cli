import { defineCommand } from 'citty'
import { fetchHistoricalOrders, fetchSpotMeta, partitionEntriesBySpot } from '../../../protocols/hyperliquid'
import { resolvePerpOutput, resolvePerpQueryArgs, resolvePerpUserContext } from './shared'
import { formatHistoryOrderRows, parseLimitArg } from './utils'

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
    const out = resolvePerpOutput(args)
    const { walletName, user } = resolvePerpUserContext(args, out)
    const coin = args.coin ? String(args.coin).toUpperCase() : undefined
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
      const spotMeta = await fetchSpotMeta(args.testnet)
      const { perps } = partitionEntriesBySpot(
        history.map((entry) => ({ coin: entry.order.coin, entry })),
        spotMeta,
      )
      const rows = formatHistoryOrderRows(
        perps
          .map(({ entry }) => entry)
          .filter((entry) => !coin || entry.order.coin === coin)
          .filter((entry) => !status || entry.status.toLowerCase() === status)
          .slice(0, limit),
      )

      if (args.json || args.format === 'json') {
        out.data({ wallet: walletName, user, history: rows })
        return
      }

      if (rows.length === 0) {
        out.success(`No historical perp orders for ${walletName} (${user})`)
        return
      }

      if (args.format === 'csv') {
        out.data('coin,status,side,size,origSize,limitPx,tif,reduceOnly,oid,cloid,statusTimestamp')
        for (const row of rows) {
          out.data(
            `${row.coin},${row.status},${row.side},${row.size},${row.origSize},${row.limitPx},${row.tif},${row.reduceOnly},${row.oid},${row.cloid},${row.statusTimestamp}`,
          )
        }
        return
      }

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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      out.warn(`Failed to fetch historical orders: ${message}`)
      process.exit(1)
    }
  },
})
