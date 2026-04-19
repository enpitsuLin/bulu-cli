import { defineCommand } from 'citty'
import { formatTimestamp } from '#/core/time'
import { createOutput, withOutputArgs } from '#/core/output'
import { listSpotFills } from '../../../hyperliquid/features/spot/use-cases/spot'
import { marketBaseArgs } from '../../../hyperliquid/shared/args'
import { requireHyperliquidWalletContext } from '../../../hyperliquid/shared/context'
import { runHyperliquidCommand } from '../../../hyperliquid/shared/errors'

export default defineCommand({
  meta: { name: 'fills', description: 'Show recent spot fills' },
  args: withOutputArgs({
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
    const out = createOutput()
    await runHyperliquidCommand(out, async () => {
      const ctx = requireHyperliquidWalletContext(args, out)
      const result = await listSpotFills(ctx, {
        pair: args.pair ? String(args.pair) : undefined,
        since: args.since ? String(args.since) : undefined,
        until: args.until ? String(args.until) : undefined,
        limit: args.limit ? String(args.limit) : undefined,
        aggregateByTime: args.aggregateByTime === true,
      })
      out.table(
        result.fills.map((fill) => ({
          time: formatTimestamp(fill.time),
          pair: fill.coin,
          dir: fill.dir ?? 'N/A',
          side: fill.side === 'B' ? 'buy' : 'sell',
          size: fill.sz,
          price: fill.px,
          fee: fill.fee ?? 'N/A',
          closedPnl: fill.closedPnl ?? 'N/A',
          oid: fill.oid,
        })),
        {
          columns: ['time', 'pair', 'dir', 'side', 'size', 'price', 'fee', 'closedPnl', 'oid'],
          title: `Spot Fills | ${result.walletName} (${result.user})`,
        },
      )
    })
  },
})
