import { defineCommand } from 'citty'
import { createOutput, withOutputArgs } from '../../../core/output'
import { placePerpOrder } from '../../../hyperliquid/features/perps/use-cases/perps'
import { marketBaseArgs } from '../../../hyperliquid/shared/args'
import { requireHyperliquidWalletContext } from '../../../hyperliquid/shared/context'
import { runHyperliquidCommand } from '../../../hyperliquid/shared/errors'

export default defineCommand({
  meta: { name: 'short', description: 'Open or increase a short perp position on Hyperliquid' },
  args: withOutputArgs({
    ...marketBaseArgs,
    coin: {
      type: 'positional',
      description: 'Trading pair symbol, e.g. BTC, ETH',
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
      const result = await placePerpOrder(ctx, {
        coin: args.coin ? String(args.coin) : undefined,
        size: args.size ? String(args.size) : undefined,
        price: args.price ? String(args.price) : undefined,
        side: 'short',
      })
      const detail = result.order.isTrigger
        ? `${result.coin} ${String(result.order.triggerKind).toUpperCase()} ${result.order.size} trigger ${result.order.triggerPx} -> ${result.order.price}`
        : `${result.coin} ${result.order.side.toUpperCase()} ${result.order.size} @ ${result.order.price}`

      out.table(result.statuses, {
        columns: ['orderIndex', 'result'],
        title: `Perp Order | ${result.walletName} | ${detail}`,
      })
    })
  },
})
