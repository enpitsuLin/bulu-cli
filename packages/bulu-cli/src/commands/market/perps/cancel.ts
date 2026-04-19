import { defineCommand } from 'citty'
import { withDefaultArgs } from '../../../core/args-def'
import { createOutput, resolveOutputOptions } from '../../../core/output'
import { presentPerpCancel } from '../../../hyperliquid/features/perps/presenters/perps'
import { cancelPerpOrders } from '../../../hyperliquid/features/perps/use-cases/perps'
import { marketBaseArgs } from '../../../hyperliquid/shared/args'
import { requireHyperliquidWalletContext } from '../../../hyperliquid/shared/context'
import { runHyperliquidCommand } from '../../../hyperliquid/shared/errors'
import { renderView } from '../../../hyperliquid/shared/view'

export default defineCommand({
  meta: { name: 'cancel', description: 'Cancel open perp orders' },
  args: withDefaultArgs({
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
    const out = createOutput(resolveOutputOptions(args))
    await runHyperliquidCommand(out, async () => {
      const ctx = requireHyperliquidWalletContext(args, out)
      const result = await cancelPerpOrders(ctx, {
        id: args.id ? String(args.id) : undefined,
        coin: args.coin ? String(args.coin) : undefined,
        all: args.all === true,
      })
      renderView(out, presentPerpCancel(result))
    })
  },
})
