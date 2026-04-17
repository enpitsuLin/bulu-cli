import { defineCommand } from 'citty'
import {
  fetchSpotMeta,
  fetchUserFills,
  fetchUserFillsByTime,
  partitionEntriesBySpot,
  resolveOrderSide,
} from '../../../protocols/hyperliquid'
import { formatTimestamp } from '../../../core/time'
import { resolvePerpOutput, resolvePerpQueryArgs, resolvePerpUserContext } from './shared'
import { parseLimitArg, parseTimeArg } from './utils'

export default defineCommand({
  meta: { name: 'fills', description: 'Show recent perp fills' },
  args: resolvePerpQueryArgs({
    coin: {
      type: 'string',
      description: 'Filter fills by perp symbol',
    },
    since: {
      type: 'string',
      description: 'Inclusive start time as unix seconds, unix milliseconds, or ISO-8601',
    },
    until: {
      type: 'string',
      description: 'Inclusive end time as unix seconds, unix milliseconds, or ISO-8601',
    },
    limit: {
      type: 'string',
      description: 'Maximum number of rows to show',
      default: '50',
    },
    aggregateByTime: {
      type: 'boolean',
      description: 'Aggregate partial fills that occurred in the same block',
      default: false,
    },
  }),
  async run({ args }) {
    const out = resolvePerpOutput(args)
    const { walletName, user } = resolvePerpUserContext(args, out)
    const coin = args.coin ? String(args.coin).toUpperCase() : undefined
    const aggregateByTime = args.aggregateByTime === true

    let limit: number
    try {
      limit = parseLimitArg(args.limit ? String(args.limit) : undefined)
    } catch (error) {
      out.warn(error instanceof Error ? error.message : String(error))
      process.exit(1)
    }

    try {
      const [fills, spotMeta] = await Promise.all([
        args.since || args.until
          ? fetchUserFillsByTime({
              user,
              startTime: parseTimeArg(String(args.since ?? '0'), 'since'),
              endTime: args.until ? parseTimeArg(String(args.until), 'until') : undefined,
              aggregateByTime,
              isTestnet: args.testnet,
            })
          : fetchUserFills(user, aggregateByTime, args.testnet),
        fetchSpotMeta(args.testnet),
      ])

      const { perps } = partitionEntriesBySpot(fills, spotMeta)
      const rows = perps
        .filter((fill) => !coin || fill.coin === coin)
        .slice(0, limit)
        .map((fill) => ({
          time: formatTimestamp(fill.time),
          coin: fill.coin,
          dir: fill.dir ?? 'N/A',
          side: resolveOrderSide(fill.side),
          size: fill.sz,
          price: fill.px,
          fee: fill.fee ?? 'N/A',
          closedPnl: fill.closedPnl ?? 'N/A',
          oid: fill.oid,
        }))

      if (args.json || args.format === 'json') {
        out.data({ wallet: walletName, user, fills: rows })
        return
      }

      if (rows.length === 0) {
        out.success(`No perp fills found for ${walletName} (${user})`)
        return
      }

      if (args.format === 'csv') {
        out.data('time,coin,dir,side,size,price,fee,closedPnl,oid')
        for (const row of rows) {
          out.data(
            `${row.time},${row.coin},${row.dir},${row.side},${row.size},${row.price},${row.fee},${row.closedPnl},${row.oid}`,
          )
        }
        return
      }

      out.table(rows, {
        columns: ['time', 'coin', 'dir', 'side', 'size', 'price', 'fee', 'closedPnl', 'oid'],
        title: `Perp Fills | ${walletName} (${user})`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      out.warn(`Failed to fetch fills: ${message}`)
      process.exit(1)
    }
  },
})
