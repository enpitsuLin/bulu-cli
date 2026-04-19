import { defineCommand } from 'citty'
import { withDefaultArgs } from '../../../core/args-def'
import { marketBaseArgs } from '../../../core/hyperliquid/command'
import { loadSpotMarketStateOrExit } from '../../../core/hyperliquid/spot'
import { createOutput, resolveOutputOptions } from '../../../core/output'

export default defineCommand({
  meta: { name: 'pairs', description: 'List tradable spot pairs' },
  args: withDefaultArgs({
    ...marketBaseArgs,
  }),
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args))
    const spotMarket = await loadSpotMarketStateOrExit(args.testnet, out)
    const tokenByIndex = new Map(spotMarket.meta.tokens.map((token) => [token.index, token]))
    const rows = spotMarket.meta.universe.map((pairMeta, idx) => {
      const [baseIndex, quoteIndex] = pairMeta.tokens
      return {
        pair: pairMeta.name,
        base: tokenByIndex.get(baseIndex)?.name ?? String(baseIndex),
        quote: tokenByIndex.get(quoteIndex)?.name ?? String(quoteIndex),
        assetId: 10_000 + pairMeta.index,
        markPx: spotMarket.contexts[idx]?.markPx ?? 'N/A',
        midPx: spotMarket.contexts[idx]?.midPx ?? 'N/A',
        dayNtlVlm: spotMarket.contexts[idx]?.dayNtlVlm ?? 'N/A',
        canonical: pairMeta.isCanonical,
      }
    })

    out.table(rows, {
      columns: ['pair', 'base', 'quote', 'assetId', 'markPx', 'midPx', 'dayNtlVlm', 'canonical'],
      title: 'Hyperliquid Spot Pairs',
    })
  },
})
