import { defineCommand } from 'citty'
import {
  fetchUserFills,
  fetchUserFillsByTime,
  normalizeSpotPair,
  partitionEntriesBySpot,
} from '../../../protocols/hyperliquid'
import { parseLimitArg, parseTimeArg } from '../utils'
import { loadSpotPairNameSetOrExit, resolveSpotOutput, resolveSpotQueryArgs, resolveSpotUserContext } from './shared'
import { formatSpotFillRows } from './utils'

export default defineCommand({
  meta: { name: 'fills', description: 'Show recent spot fills' },
  args: resolveSpotQueryArgs({
    pair: {
      type: 'string',
      description: 'Filter fills by exact Hyperliquid spot pair',
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
    const out = resolveSpotOutput(args)
    const { walletName, user } = resolveSpotUserContext(args, out)
    const spotPairs = await loadSpotPairNameSetOrExit(args.testnet, out)
    const pairFilter = args.pair ? normalizeSpotPair(String(args.pair)) : undefined
    const aggregateByTime = args.aggregateByTime === true

    let limit: number
    try {
      limit = parseLimitArg(args.limit ? String(args.limit) : undefined)
    } catch (error) {
      out.warn(error instanceof Error ? error.message : String(error))
      process.exit(1)
    }

    try {
      const fills =
        args.since || args.until
          ? await fetchUserFillsByTime({
              user,
              startTime: parseTimeArg(String(args.since ?? '0'), 'since'),
              endTime: args.until ? parseTimeArg(String(args.until), 'until') : undefined,
              aggregateByTime,
              isTestnet: args.testnet,
            })
          : await fetchUserFills(user, aggregateByTime, args.testnet)

      const { spot } = partitionEntriesBySpot(fills, spotPairs)
      const rows = formatSpotFillRows(spot.filter((fill) => !pairFilter || fill.coin === pairFilter).slice(0, limit))

      if (args.json || args.format === 'json') {
        out.data({ wallet: walletName, user, fills: rows })
        return
      }

      if (rows.length === 0) {
        out.success(`No spot fills found for ${walletName} (${user})`)
        return
      }

      if (args.format === 'csv') {
        out.data('time,pair,dir,side,size,price,fee,closedPnl,oid')
        for (const row of rows) {
          out.data(
            `${row.time},${row.pair},${row.dir},${row.side},${row.size},${row.price},${row.fee},${row.closedPnl},${row.oid}`,
          )
        }
        return
      }

      out.table(rows, {
        columns: ['time', 'pair', 'dir', 'side', 'size', 'price', 'fee', 'closedPnl', 'oid'],
        title: `Spot Fills | ${walletName} (${user})`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      out.warn(`Failed to fetch fills: ${message}`)
      process.exit(1)
    }
  },
})
