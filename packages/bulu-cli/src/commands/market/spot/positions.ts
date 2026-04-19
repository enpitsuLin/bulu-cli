import { defineCommand } from 'citty'
import { withOutputArgs } from '../../../core/output'
import { createOutput } from '../../../core/output'
import { presentSpotPositions } from '../../../hyperliquid/features/spot/presenters/spot'
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
      out.data(presentSpotPositions(result))
    })
  },
})
