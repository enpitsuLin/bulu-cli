import { defineCommand } from 'citty'
import { withDefaultArgs } from '../../../core/args-def'
import { createOutput, resolveOutputOptions } from '../../../core/output'
import { presentSpotOrders } from '../../../hyperliquid/features/spot/presenters/spot'
import { listSpotOrders } from '../../../hyperliquid/features/spot/use-cases/spot'
import { marketBaseArgs } from '../../../hyperliquid/shared/args'
import { requireHyperliquidWalletContext } from '../../../hyperliquid/shared/context'
import { runHyperliquidCommand } from '../../../hyperliquid/shared/errors'
import { renderView } from '../../../hyperliquid/shared/view'

export default defineCommand({
  meta: { name: 'orders', description: 'Show open spot orders' },
  args: withDefaultArgs({
    ...marketBaseArgs,
    pair: {
      type: 'string',
      description: 'Filter orders by exact Hyperliquid spot pair',
    },
  }),
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args))
    await runHyperliquidCommand(out, async () => {
      const ctx = requireHyperliquidWalletContext(args, out)
      const result = await listSpotOrders(ctx, {
        pair: args.pair ? String(args.pair) : undefined,
      })
      renderView(out, presentSpotOrders(result))
    })
  },
})
