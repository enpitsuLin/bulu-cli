import { defineCommand } from 'citty'
import { parseLimitArg, parseTimeArg } from '../../../core/hyperliquid/args'
import { marketBaseArgs } from '../../../core/hyperliquid/command'
import { fetchListItems } from '../../../core/hyperliquid/query'
import { formatSpotFillRow, loadSpotPairNameSetOrExit, resolveSpotUserContext } from '../../../core/hyperliquid/spot'
import {
  fetchUserFills,
  fetchUserFillsByTime,
  normalizeSpotPair,
  partitionEntriesBySpot,
} from '../../../protocols/hyperliquid'
import { withDefaultArgs } from '../../../core/args-def'
import { createOutput, resolveOutputOptions } from '../../../core/output'

export default defineCommand({
  meta: { name: 'fills', description: 'Show recent spot fills' },
  args: withDefaultArgs({
    ...marketBaseArgs,
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
    const out = createOutput(resolveOutputOptions(args))
    const { walletName, user } = resolveSpotUserContext(args, out)
    const spotPairs = await loadSpotPairNameSetOrExit(args.testnet, out)
    const pairFilter = args.pair ? normalizeSpotPair(String(args.pair)) : undefined
    const aggregateByTime = args.aggregateByTime === true

    const limit = parseLimitArg(args.limit ? String(args.limit) : undefined)

    const rows = await fetchListItems({
      out,
      fetchItems: async () => {
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
        return spot
      },
      filter: pairFilter ? (fill) => fill.coin === pairFilter : undefined,
      limit,
      toRow: formatSpotFillRow,
    })

    out.table(rows, {
      columns: ['time', 'pair', 'dir', 'side', 'size', 'price', 'fee', 'closedPnl', 'oid'],
      title: `Spot Fills | ${walletName} (${user})`,
    })
  },
})
