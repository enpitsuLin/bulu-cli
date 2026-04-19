import { defineCommand } from 'citty'
import { withOutputArgs } from '#/core/output'
import { useOutput } from '#/core/output'

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
    const _out = useOutput()
    // TODO: implement get Trading pair symbol price from hyperliquid api
  },
})
