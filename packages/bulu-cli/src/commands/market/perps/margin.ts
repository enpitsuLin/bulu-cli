import { defineCommand } from 'citty'
import { createOutput, withOutputArgs } from '#/core/output'
import { updatePerpMargin } from '../../../hyperliquid/features/perps/use-cases/perps'
import { marketBaseArgs } from '../../../hyperliquid/shared/args'
import { requireHyperliquidWalletContext } from '../../../hyperliquid/shared/context'
import { runHyperliquidCommand } from '../../../hyperliquid/shared/errors'

export default defineCommand({
  meta: { name: 'margin', description: 'Add or remove isolated margin for a perp position' },
  args: withOutputArgs({
    ...marketBaseArgs,
    coin: {
      type: 'positional',
      description: 'Trading pair symbol, e.g. BTC, ETH',
      required: true,
    },
    delta: {
      type: 'positional',
      description: 'USDC delta to apply, e.g. 10 or -5.25',
      required: true,
    },
  }),
  async run({ args }) {
    const out = createOutput()
    await runHyperliquidCommand(out, async () => {
      const ctx = requireHyperliquidWalletContext(args, out)
      const result = await updatePerpMargin(ctx, {
        coin: args.coin ? String(args.coin) : undefined,
        delta: args.delta ? String(args.delta) : undefined,
      })
      out.table(
        [
          {
            coin: result.coin,
            delta: result.delta,
            ntli: result.ntli,
          },
        ],
        {
          columns: ['coin', 'delta', 'ntli'],
          title: `Updated Isolated Margin | ${result.walletName} (${result.user})`,
        },
      )
    })
  },
})
