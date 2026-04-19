import { defineCommand } from 'citty'
import { withOutputArgs } from '../../../core/output'
import { createOutput } from '../../../core/output'
import { presentPerpCancel } from '../../../hyperliquid/features/perps/presenters/perps'
import { cancelPerpOrders } from '../../../hyperliquid/features/perps/use-cases/perps'
import { marketBaseArgs } from '../../../hyperliquid/shared/args'
import { requireHyperliquidWalletContext } from '../../../hyperliquid/shared/context'
import { runHyperliquidCommand } from '../../../hyperliquid/shared/errors'

export default defineCommand({
  meta: { name: 'cancel', description: 'Cancel open perp orders' },
  args: withOutputArgs({
    ...marketBaseArgs,
    id: {
      type: 'positional',
      description: 'Order id or client order id',
      required: false,
    },
    coin: {
      type: 'string',
      description: 'Restrict cancellation to a specific perp symbol',
    },
    all: {
      type: 'boolean',
      description: 'Cancel all open perp orders, optionally filtered by --coin',
      default: false,
    },
  }),
  async run({ args }) {
    const out = createOutput()
    await runHyperliquidCommand(out, async () => {
      const ctx = requireHyperliquidWalletContext(args, out)
      const result = await cancelPerpOrders(ctx, {
        id: args.id ? String(args.id) : undefined,
        coin: args.coin ? String(args.coin) : undefined,
        all: args.all === true,
      })
      out.data(presentPerpCancel(result))
    })
  },
})
