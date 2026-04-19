import { defineCommand } from 'citty'
import { withOutputArgs } from '../../../core/output'
import { createOutput } from '../../../core/output'
import { presentSpotOrders } from '../../../hyperliquid/features/spot/presenters/spot'
import { listSpotOrders } from '../../../hyperliquid/features/spot/use-cases/spot'
import { marketBaseArgs } from '../../../hyperliquid/shared/args'
import { requireHyperliquidWalletContext } from '../../../hyperliquid/shared/context'
import { runHyperliquidCommand } from '../../../hyperliquid/shared/errors'

export default defineCommand({
  meta: { name: 'orders', description: 'Show open spot orders' },
  args: withOutputArgs({
    ...marketBaseArgs,
    pair: {
      type: 'string',
      description: 'Filter orders by exact Hyperliquid spot pair',
    },
  }),
  async run({ args }) {
    const out = createOutput()
    await runHyperliquidCommand(out, async () => {
      const ctx = requireHyperliquidWalletContext(args, out)
      const result = await listSpotOrders(ctx, {
        pair: args.pair ? String(args.pair) : undefined,
      })
      out.data(presentSpotOrders(result))
    })
  },
})
