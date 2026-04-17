import { defineCommand } from 'citty'
import { resolveSpotOutput, resolveSpotQueryArgs, loadSpotMarketStateOrExit } from './shared'

export default defineCommand({
  meta: { name: 'pairs', description: 'List tradable spot pairs' },
  args: resolveSpotQueryArgs(),
  async run({ args }) {
    const out = resolveSpotOutput(args)
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

    if (args.json || args.format === 'json') {
      out.data({ pairs: rows })
      return
    }

    if (rows.length === 0) {
      out.success('No spot pairs available')
      return
    }

    if (args.format === 'csv') {
      out.data('pair,base,quote,assetId,markPx,midPx,dayNtlVlm,canonical')
      for (const row of rows) {
        out.data(
          `${row.pair},${row.base},${row.quote},${row.assetId},${row.markPx},${row.midPx},${row.dayNtlVlm},${row.canonical}`,
        )
      }
      return
    }

    out.table(rows, {
      columns: ['pair', 'base', 'quote', 'assetId', 'markPx', 'midPx', 'dayNtlVlm', 'canonical'],
      title: 'Hyperliquid Spot Pairs',
    })
  },
})
