import { defineCommand } from 'citty'
import { createOutput, withOutputArgs } from '#/core/output'
import { placeSpotOrder } from '../../../hyperliquid/features/spot/use-cases/spot'
import { marketBaseArgs } from '../../../hyperliquid/shared/args'
import { requireHyperliquidWalletContext } from '../../../hyperliquid/shared/context'
import { runHyperliquidCommand } from '../../../hyperliquid/shared/errors'

export default defineCommand({
  meta: { name: 'buy', description: 'Place a spot buy order on Hyperliquid' },
  args: withOutputArgs({
    ...marketBaseArgs,
    pair: {
      type: 'positional',
      description: 'Exact Hyperliquid spot pair, e.g. PURR/USDC, UBTC/USDC, @107',
      required: true,
    },
    size: {
      type: 'string',
      description: 'Order size in base asset units',
      required: true,
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
      const result = await placeSpotOrder(ctx, {
        pair: args.pair ? String(args.pair) : undefined,
        size: args.size ? String(args.size) : undefined,
        price: args.price ? String(args.price) : undefined,
        side: 'buy',
      })
      out.table(result.statuses, {
        columns: ['orderIndex', 'result'],
        title: `Spot Order | ${result.walletName} | ${result.pair} ${result.side.toUpperCase()} ${result.order.size} @ ${result.order.price}`,
      })
    })
  },
})
