import { defineCommand } from 'citty'
import { withOutputArgs } from '../../../core/output'
import { createOutput } from '../../../core/output'
import { presentPerpStatus } from '../../../hyperliquid/features/perps/presenters/perps'
import { getPerpOrderStatus } from '../../../hyperliquid/features/perps/use-cases/perps'
import { marketBaseArgs } from '../../../hyperliquid/shared/args'
import { requireHyperliquidWalletContext } from '../../../hyperliquid/shared/context'
import { runHyperliquidCommand } from '../../../hyperliquid/shared/errors'

export default defineCommand({
  meta: { name: 'status', description: 'Query perp order status by oid or cloid' },
  args: withOutputArgs({
    ...marketBaseArgs,
    id: {
      type: 'positional',
      description: 'Order id or client order id',
      required: true,
    },
  }),
  async run({ args }) {
    const out = createOutput()
    await runHyperliquidCommand(out, async () => {
      const ctx = requireHyperliquidWalletContext(args, out)
      const result = await getPerpOrderStatus(ctx, {
        id: args.id ? String(args.id) : undefined,
      })
      out.data(presentPerpStatus(result))
    })
  },
})
