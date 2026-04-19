import { defineCommand } from 'citty'
import { createOutput, withOutputArgs } from '../../../core/output'
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
      const tokenByIndex = new Map(result.meta.tokens.map((token) => [token.index, token]))

      out.table(
        result.meta.universe.map((pairMeta, idx) => {
          const [baseIndex, quoteIndex] = pairMeta.tokens
          const context = result.contexts[idx] ?? {}
          return {
            pair: pairMeta.name,
            base: tokenByIndex.get(baseIndex)?.name ?? String(baseIndex),
            quote: tokenByIndex.get(quoteIndex)?.name ?? String(quoteIndex),
            assetId: 10_000 + pairMeta.index,
            markPx: String(context.markPx ?? 'N/A'),
            midPx: String(context.midPx ?? 'N/A'),
            dayNtlVlm: String(context.dayNtlVlm ?? 'N/A'),
            canonical: pairMeta.isCanonical,
          }
        }),
        {
          columns: ['pair', 'base', 'quote', 'assetId', 'markPx', 'midPx', 'dayNtlVlm', 'canonical'],
          title: 'Hyperliquid Spot Pairs',
        },
      )
    })
  },
})
