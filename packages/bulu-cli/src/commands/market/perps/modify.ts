import { defineCommand } from 'citty'
import { withDefaultArgs } from '../../../core/args-def'
import { createOutput, resolveOutputOptions } from '../../../core/output'
import { presentPerpModify } from '../../../hyperliquid/features/perps/presenters/perps'
import { modifyPerpOrder } from '../../../hyperliquid/features/perps/use-cases/perps'
import { marketBaseArgs } from '../../../hyperliquid/shared/args'
import { requireHyperliquidWalletContext } from '../../../hyperliquid/shared/context'
import { runHyperliquidCommand } from '../../../hyperliquid/shared/errors'
import { renderView } from '../../../hyperliquid/shared/view'

export default defineCommand({
  meta: { name: 'modify', description: 'Modify an open perp order by oid or cloid' },
  args: withDefaultArgs({
    ...marketBaseArgs,
    id: {
      type: 'positional',
      description: 'Order id or client order id',
      required: true,
    },
    price: {
      type: 'string',
      description: 'New limit price or triggered execution price',
    },
    size: {
      type: 'string',
      description: 'New order size in base asset units',
    },
    trigger: {
      type: 'string',
      description: 'New trigger price for TP/SL orders',
    },
    tp: {
      type: 'boolean',
      description: 'Treat the modified trigger order as take profit',
      default: false,
    },
    sl: {
      type: 'boolean',
      description: 'Treat the modified trigger order as stop loss',
      default: false,
    },
  }),
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args))
    await runHyperliquidCommand(out, async () => {
      const ctx = requireHyperliquidWalletContext(args, out)
      const result = await modifyPerpOrder(ctx, {
        id: args.id ? String(args.id) : undefined,
        price: args.price ? String(args.price) : undefined,
        size: args.size ? String(args.size) : undefined,
        trigger: args.trigger ? String(args.trigger) : undefined,
        tp: args.tp === true,
        sl: args.sl === true,
      })
      renderView(out, presentPerpModify(result))
    })
  },
})
