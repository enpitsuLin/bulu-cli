import { defineCommand } from 'citty'
import { withOutputArgs } from '../../../core/output'
import { createOutput } from '../../../core/output'
import { presentPerpOrderResult } from '../../../hyperliquid/features/perps/presenters/perps'
import { placePerpOrder } from '../../../hyperliquid/features/perps/use-cases/perps'
import { marketBaseArgs } from '../../../hyperliquid/shared/args'
import { requireHyperliquidWalletContext } from '../../../hyperliquid/shared/context'
import { runHyperliquidCommand } from '../../../hyperliquid/shared/errors'

export default defineCommand({
  meta: { name: 'close', description: 'Close or reduce a perp position on Hyperliquid' },
  args: withOutputArgs({
    ...marketBaseArgs,
    coin: {
      type: 'positional',
      description: 'Trading pair symbol, e.g. BTC, ETH',
      required: true,
    },
    size: {
      type: 'string',
      description: 'Order size in base asset units (omit to close the full position)',
      required: false,
    },
    price: {
      type: 'string',
      description: 'Limit price (omit for market order)',
    },
  }),
  async run({ args }) {
    const out = createOutput()
    await runHyperliquidCommand(out, async () => {
      const ctx = requireHyperliquidWalletContext(args, out)
      const result = await placePerpOrder(ctx, {
        coin: args.coin ? String(args.coin) : undefined,
        size: args.size ? String(args.size) : undefined,
        price: args.price ? String(args.price) : undefined,
        close: true,
      })
      out.data(presentPerpOrderResult(result))
    })
  },
})
