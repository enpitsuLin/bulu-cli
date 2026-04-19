import { defineCommand } from 'citty'
import { withDefaultArgs } from '../../../core/args-def'
import { createOutput, resolveOutputOptions } from '../../../core/output'
import { presentPerpFills } from '../../../hyperliquid/features/perps/presenters/perps'
import { listPerpFills } from '../../../hyperliquid/features/perps/use-cases/perps'
import { marketBaseArgs } from '../../../hyperliquid/shared/args'
import { requireHyperliquidWalletContext } from '../../../hyperliquid/shared/context'
import { runHyperliquidCommand } from '../../../hyperliquid/shared/errors'
import { renderView } from '../../../hyperliquid/shared/view'

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
    await runHyperliquidCommand(out, async () => {
      const ctx = requireHyperliquidWalletContext(args, out)
      const result = await listPerpFills(ctx, {
        coin: args.coin ? String(args.coin) : undefined,
        since: args.since ? String(args.since) : undefined,
        until: args.until ? String(args.until) : undefined,
        limit: args.limit ? String(args.limit) : undefined,
        aggregateByTime: args.aggregateByTime === true,
      })
      renderView(out, presentPerpFills(result))
    })
  },
})
