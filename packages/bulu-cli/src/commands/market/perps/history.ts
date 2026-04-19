import { defineCommand } from 'citty'
import { withOutputArgs } from '../../../core/output'
import { createOutput } from '../../../core/output'
import { presentPerpHistory } from '../../../hyperliquid/features/perps/presenters/perps'
import { listPerpHistory } from '../../../hyperliquid/features/perps/use-cases/perps'
import { marketBaseArgs } from '../../../hyperliquid/shared/args'
import { requireHyperliquidWalletContext } from '../../../hyperliquid/shared/context'
import { runHyperliquidCommand } from '../../../hyperliquid/shared/errors'

export default defineCommand({
  meta: { name: 'history', description: 'Show historical perp orders' },
  args: withOutputArgs({
    ...marketBaseArgs,
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
    const out = createOutput()
    await runHyperliquidCommand(out, async () => {
      const ctx = requireHyperliquidWalletContext(args, out)
      const result = await listPerpHistory(ctx, {
        coin: args.coin ? String(args.coin) : undefined,
        status: args.status ? String(args.status) : undefined,
        limit: args.limit ? String(args.limit) : undefined,
      })
      out.data(presentPerpHistory(result))
    })
  },
})
