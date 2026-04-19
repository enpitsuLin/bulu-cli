import { defineCommand } from 'citty'
import { withOutputArgs } from '../../../core/output'
import { createOutput } from '../../../core/output'
import { presentSpotPairs } from '../../../hyperliquid/features/spot/presenters/spot'
import { listSpotPairs } from '../../../hyperliquid/features/spot/use-cases/spot'
import { marketBaseArgs } from '../../../hyperliquid/shared/args'
import { createHyperliquidCommandContext } from '../../../hyperliquid/shared/context'
import { runHyperliquidCommand } from '../../../hyperliquid/shared/errors'

export default defineCommand({
  meta: { name: 'pairs', description: 'List tradable spot pairs' },
  args: withOutputArgs({
    ...marketBaseArgs,
  }),
  async run({ args }) {
    const out = createOutput()
    await runHyperliquidCommand(out, async () => {
      const ctx = createHyperliquidCommandContext(args, out)
      const result = await listSpotPairs(ctx.testnet)
      out.data(presentSpotPairs(result))
    })
  },
})
