import { defineCommand } from 'citty'
import { withDefaultArgs } from '../../../core/args-def'
import { marketBaseArgs } from '../shared'
import { runPerpOrderCommand } from './shared'

export default defineCommand({
  meta: { name: 'close', description: 'Close or reduce a perp position on Hyperliquid' },
  args: withDefaultArgs({
    ...marketBaseArgs,
    coin: {
      type: 'positional',
      description: 'Trading pair symbol, e.g. BTC, ETH',
      required: true,
    },
    size: {
      type: 'string',
      description: 'Order size in base asset units (omit to close the full position)',
      required: false,
    },
    price: {
      type: 'string',
      description: 'Limit price (omit for market order)',
    },
  }),
  async run({ args }) {
    await runPerpOrderCommand(args, { close: true })
  },
})
