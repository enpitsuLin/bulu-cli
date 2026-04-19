import { defineCommand } from 'citty'
import { withDefaultArgs } from '../../../core/args-def'
import { marketBaseArgs } from '../shared'
import { runSpotOrderCommand } from './shared'

export default defineCommand({
  meta: { name: 'sell', description: 'Place a spot sell order on Hyperliquid' },
  args: withDefaultArgs({
    ...marketBaseArgs,
    pair: {
      type: 'positional',
      description: 'Exact Hyperliquid spot pair, e.g. PURR/USDC, UBTC/USDC, @107',
      required: true,
    },
    size: {
      type: 'string',
      description: 'Order size in base asset units',
      required: true,
    },
    price: {
      type: 'string',
      description: 'Limit price (omit for market order)',
    },
  }),
  async run({ args }) {
    await runSpotOrderCommand(args, 'sell')
  },
})
