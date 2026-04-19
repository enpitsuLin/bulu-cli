import { defineCommand } from 'citty'
import { withOutputArgs } from '../../../core/output'
import { createOutput } from '../../../core/output'
import { presentPerpOrders } from '../../../hyperliquid/features/perps/presenters/perps'
import { listPerpOrders } from '../../../hyperliquid/features/perps/use-cases/perps'
import { marketBaseArgs } from '../../../hyperliquid/shared/args'
import { requireHyperliquidWalletContext } from '../../../hyperliquid/shared/context'
import { runHyperliquidCommand } from '../../../hyperliquid/shared/errors'

export default defineCommand({
  meta: { name: 'orders', description: 'Show open perp orders' },
  args: withOutputArgs({
    ...marketBaseArgs,
    coin: {
      type: 'string',
      description: 'Filter orders by perp symbol',
    },
  }),
  async run({ args }) {
    const out = createOutput()
    await runHyperliquidCommand(out, async () => {
      const ctx = requireHyperliquidWalletContext(args, out)
      const result = await listPerpOrders(ctx, {
        coin: args.coin ? String(args.coin) : undefined,
      })
      out.data(presentPerpOrders(result))
    })
  },
})
