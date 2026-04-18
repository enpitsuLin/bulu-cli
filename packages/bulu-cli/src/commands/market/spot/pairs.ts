import { defineCommand } from 'citty'
import { createOutput, resolveOutputOptions } from '../../../core/output'
import { resolveSpotQueryArgs, loadSpotMarketStateOrExit } from './shared'
import { renderResult } from '../command-helpers'

export default defineCommand({
  meta: { name: 'pairs', description: 'List tradable spot pairs' },
  args: resolveSpotQueryArgs(),
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

    renderResult(out, args, {
      rows,
      dataKey: 'pairs',
      emptyMessage: 'No spot pairs available',
      columns: ['pair', 'base', 'quote', 'assetId', 'markPx', 'midPx', 'dayNtlVlm', 'canonical'],
      title: 'Hyperliquid Spot Pairs',
    })
  },
})
