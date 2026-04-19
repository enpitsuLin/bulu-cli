import { defineCommand } from 'citty'
import { formatTimestamp } from '../../../core/time'
import { createOutput, withOutputArgs } from '../../../core/output'
import { resolveOrderSide } from '../../../hyperliquid/domain/orders/resolve'
import { listPerpFills } from '../../../hyperliquid/features/perps/use-cases/perps'
import { marketBaseArgs } from '../../../hyperliquid/shared/args'
import { requireHyperliquidWalletContext } from '../../../hyperliquid/shared/context'
import { runHyperliquidCommand } from '../../../hyperliquid/shared/errors'

export default defineCommand({
  meta: { name: 'fills', description: 'Show recent perp fills' },
  args: withOutputArgs({
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
    const out = createOutput()
    await runHyperliquidCommand(out, async () => {
      const ctx = requireHyperliquidWalletContext(args, out)
      const result = await listPerpFills(ctx, {
        coin: args.coin ? String(args.coin) : undefined,
        since: args.since ? String(args.since) : undefined,
        until: args.until ? String(args.until) : undefined,
        limit: args.limit ? String(args.limit) : undefined,
        aggregateByTime: args.aggregateByTime === true,
      })
      out.table(
        result.fills.map((fill) => ({
          time: formatTimestamp(fill.time),
          coin: fill.coin,
          dir: fill.dir ?? 'N/A',
          side: resolveOrderSide(fill.side),
          size: fill.sz,
          price: fill.px,
          fee: fill.fee ?? 'N/A',
          closedPnl: fill.closedPnl ?? 'N/A',
          oid: fill.oid,
        })),
        {
          columns: ['time', 'coin', 'dir', 'side', 'size', 'price', 'fee', 'closedPnl', 'oid'],
          title: `Perp Fills | ${result.walletName} (${result.user})`,
        },
      )
    })
  },
})
