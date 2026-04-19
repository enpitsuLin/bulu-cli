import { defineCommand } from 'citty'
import { withDefaultArgs } from '../../../core/args-def'
import { createOutput, resolveOutputOptions } from '../../../core/output'
import { presentSpotPairs } from '../../../hyperliquid/features/spot/presenters/spot'
import { listSpotPairs } from '../../../hyperliquid/features/spot/use-cases/spot'
import { marketBaseArgs } from '../../../hyperliquid/shared/args'
import { createHyperliquidCommandContext } from '../../../hyperliquid/shared/context'
import { runHyperliquidCommand } from '../../../hyperliquid/shared/errors'
import { renderView } from '../../../hyperliquid/shared/view'

export default defineCommand({
  meta: { name: 'pairs', description: 'List tradable spot pairs' },
  args: withDefaultArgs({
    ...marketBaseArgs,
  }),
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args))
    await runHyperliquidCommand(out, async () => {
      const ctx = createHyperliquidCommandContext(args, out)
      const result = await listSpotPairs(ctx.testnet)
      renderView(out, presentSpotPairs(result))
    })
  },
})
