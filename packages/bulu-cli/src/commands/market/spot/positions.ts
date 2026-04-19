import { defineCommand } from 'citty'
import { createOutput, withOutputArgs } from '../../../core/output'
import { listSpotPositions } from '../../../hyperliquid/features/spot/use-cases/spot'
import { marketBaseArgs } from '../../../hyperliquid/shared/args'
import { requireHyperliquidWalletContext } from '../../../hyperliquid/shared/context'
import { runHyperliquidCommand } from '../../../hyperliquid/shared/errors'

export default defineCommand({
  meta: { name: 'positions', description: 'Show spot balances' },
  args: withOutputArgs({
    ...marketBaseArgs,
  }),
  async run({ args }) {
    const out = createOutput()
    await runHyperliquidCommand(out, async () => {
      const ctx = requireHyperliquidWalletContext(args, out)
      const result = await listSpotPositions(ctx)
      out.table(
        result.balances.map((balance) => ({
          coin: balance.coin,
          total: balance.total,
          hold: balance.hold,
          entryNtl: balance.entryNtl,
        })),
        {
          columns: ['coin', 'total', 'hold', 'entryNtl'],
          title: `Spot Balances | ${result.walletName} (${result.user})`,
        },
      )
    })
  },
})
