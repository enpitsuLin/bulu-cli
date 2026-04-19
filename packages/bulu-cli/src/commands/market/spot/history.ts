import { defineCommand } from 'citty'
import { withDefaultArgs } from '../../../core/args-def'
import { createOutput, resolveOutputOptions } from '../../../core/output'
import { presentSpotHistory } from '../../../hyperliquid/features/spot/presenters/spot'
import { listSpotHistory } from '../../../hyperliquid/features/spot/use-cases/spot'
import { marketBaseArgs } from '../../../hyperliquid/shared/args'
import { requireHyperliquidWalletContext } from '../../../hyperliquid/shared/context'
import { runHyperliquidCommand } from '../../../hyperliquid/shared/errors'
import { renderView } from '../../../hyperliquid/shared/view'

export default defineCommand({
  meta: { name: 'history', description: 'Show historical spot orders' },
  args: withDefaultArgs({
    ...marketBaseArgs,
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
    const out = createOutput(resolveOutputOptions(args))
    await runHyperliquidCommand(out, async () => {
      const ctx = requireHyperliquidWalletContext(args, out)
      const result = await listSpotHistory(ctx, {
        pair: args.pair ? String(args.pair) : undefined,
        status: args.status ? String(args.status) : undefined,
        limit: args.limit ? String(args.limit) : undefined,
      })
      renderView(out, presentSpotHistory(result))
    })
  },
})
