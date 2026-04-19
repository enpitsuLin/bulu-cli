import { defineCommand } from 'citty'
import { withOutputArgs } from '../../../core/output'
import { createOutput } from '../../../core/output'
import { presentPerpPositions } from '../../../hyperliquid/features/perps/presenters/perps'
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
      out.data(presentPerpPositions(result))
    })
  },
})
