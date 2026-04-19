import { defineCommand } from 'citty'
import { withOutputArgs } from '#/core/output'
import { createOutput } from '#/core/output'
import { getPriceSummary } from '../../hyperliquid/features/price/use-cases/get-price-summary'
import { runHyperliquidCommand } from '../../hyperliquid/shared/errors'

export default defineCommand({
  meta: { name: 'price', description: 'Get Hyperliquid price for a trading pair' },
  args: withOutputArgs({
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
    const out = createOutput()
    await runHyperliquidCommand(out, async () => {
      const result = await getPriceSummary({
        pair: args.pair ? String(args.pair) : undefined,
        period: args.period ? String(args.period) : undefined,
        testnet: false,
      })
      out.data(result)
    })
  },
})
