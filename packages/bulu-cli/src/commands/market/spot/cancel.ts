import { defineCommand } from 'citty'
import { withDefaultArgs } from '../../../core/args-def'
import { createOutput, resolveOutputOptions } from '../../../core/output'
import { presentSpotCancel } from '../../../hyperliquid/features/spot/presenters/spot'
import { cancelSpotOrders } from '../../../hyperliquid/features/spot/use-cases/spot'
import { marketBaseArgs } from '../../../hyperliquid/shared/args'
import { requireHyperliquidWalletContext } from '../../../hyperliquid/shared/context'
import { runHyperliquidCommand } from '../../../hyperliquid/shared/errors'
import { renderView } from '../../../hyperliquid/shared/view'

export default defineCommand({
  meta: { name: 'cancel', description: 'Cancel open spot orders' },
  args: withDefaultArgs({
    ...marketBaseArgs,
    id: {
      type: 'positional',
      description: 'Order id or client order id',
      required: false,
    },
    pair: {
      type: 'string',
      description: 'Restrict cancellation to a specific spot pair',
    },
    all: {
      type: 'boolean',
      description: 'Cancel all open spot orders, optionally filtered by --pair',
      default: false,
    },
  }),
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args))
    await runHyperliquidCommand(out, async () => {
      const ctx = requireHyperliquidWalletContext(args, out)
      const result = await cancelSpotOrders(ctx, {
        id: args.id ? String(args.id) : undefined,
        pair: args.pair ? String(args.pair) : undefined,
        all: args.all === true,
      })
      renderView(out, presentSpotCancel(result))
    })
  },
})
