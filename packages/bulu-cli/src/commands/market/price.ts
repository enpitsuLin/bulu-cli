import { defineCommand } from 'citty'
import { withDefaultArgs } from '../../core/args-def'
import { createOutput, resolveOutputOptions } from '../../core/output'
import { presentPriceSummary } from '../../hyperliquid/features/price/presenters/present-price-summary'
import { getPriceSummary } from '../../hyperliquid/features/price/use-cases/get-price-summary'
import { runHyperliquidCommand } from '../../hyperliquid/shared/errors'
import { renderView } from '../../hyperliquid/shared/view'

export default defineCommand({
  meta: { name: 'price', description: 'Get Hyperliquid price for a trading pair' },
  args: withDefaultArgs({
    pair: {
      type: 'positional',
      description: 'Trading pair symbol, e.g. BTC, ETH, SOL',
      required: true,
    },
    period: {
      type: 'string',
      description: 'Candle period: 1m, 5m, 15m, 1h, 4h, 1d',
      alias: 'p',
    },
  }),
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args))
    await runHyperliquidCommand(out, async () => {
      const result = await getPriceSummary({
        pair: args.pair ? String(args.pair) : undefined,
        period: args.period ? String(args.period) : undefined,
        testnet: false,
      })
      renderView(out, presentPriceSummary(result, resolveOutputOptions(args)))
    })
  },
})
