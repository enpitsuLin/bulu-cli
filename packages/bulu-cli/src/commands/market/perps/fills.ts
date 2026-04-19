import { defineCommand } from 'citty'
import { parseLimitArg, parseTimeArg } from '../../../core/hyperliquid/args'
import { marketBaseArgs } from '../../../core/hyperliquid/command'
import { fetchListItems } from '../../../core/hyperliquid/query'
import { formatPerpFillRow, resolvePerpUserContext } from '../../../core/hyperliquid/perps'
import {
  fetchSpotMeta,
  fetchUserFills,
  fetchUserFillsByTime,
  partitionEntriesBySpot,
} from '../../../protocols/hyperliquid'
import { withDefaultArgs } from '../../../core/args-def'
import { createOutput, resolveOutputOptions } from '../../../core/output'

export default defineCommand({
  meta: { name: 'fills', description: 'Show recent perp fills' },
  args: withDefaultArgs({
    ...marketBaseArgs,
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
    const out = createOutput(resolveOutputOptions(args))
    const { walletName, user } = resolvePerpUserContext(args, out)
    const coin = args.coin ? String(args.coin).toUpperCase() : undefined
    const aggregateByTime = args.aggregateByTime === true

    const limit = parseLimitArg(args.limit ? String(args.limit) : undefined)

    const rows = await fetchListItems({
      out,
      fetchItems: async () => {
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
        return perps
      },
      filter: coin ? (fill) => fill.coin === coin : undefined,
      limit,
      toRow: formatPerpFillRow,
    })

    out.table(rows, {
      columns: ['time', 'coin', 'dir', 'side', 'size', 'price', 'fee', 'closedPnl', 'oid'],
      title: `Perp Fills | ${walletName} (${user})`,
    })
  },
})
