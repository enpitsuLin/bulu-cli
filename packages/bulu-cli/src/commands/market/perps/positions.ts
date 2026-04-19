import { defineCommand } from 'citty'
import { createOutput, withOutputArgs } from '../../../core/output'
import { listPerpPositions } from '../../../hyperliquid/features/perps/use-cases/perps'
import { marketBaseArgs } from '../../../hyperliquid/shared/args'
import { requireHyperliquidWalletContext } from '../../../hyperliquid/shared/context'
import { runHyperliquidCommand } from '../../../hyperliquid/shared/errors'

export default defineCommand({
  meta: { name: 'positions', description: 'Show perp positions' },
  args: withOutputArgs({
    ...marketBaseArgs,
  }),
  async run({ args }) {
    const out = createOutput()
    await runHyperliquidCommand(out, async () => {
      const ctx = requireHyperliquidWalletContext(args, out)
      const result = await listPerpPositions(ctx)
      out.table(
        result.positions.map((position) => ({
          coin: position.coin,
          size: position.szi,
          entryPx: position.entryPx ?? 'N/A',
          positionValue: position.positionValue,
          unrealizedPnl: position.unrealizedPnl,
          leverage:
            typeof position.leverage === 'object' && position.leverage !== null
              ? `${position.leverage.value}x (${position.leverage.type === 'cross' ? 'cross' : 'iso'})`
              : String(position.leverage),
          liquidationPx: position.liquidationPx ?? 'N/A',
        })),
        {
          columns: ['coin', 'size', 'entryPx', 'positionValue', 'unrealizedPnl', 'leverage', 'liquidationPx'],
          title: `Perp Positions | ${result.walletName} (${result.user})`,
        },
      )
    })
  },
})
