import { defineCommand } from 'citty'
import { withDefaultArgs } from '../../../core/args-def'
import { marketBaseArgs } from '../../../core/hyperliquid/command'
import { executePerpOrderCommand, renderPerpOrderResult } from '../../../core/hyperliquid/perps'
import { createOutput, resolveOutputOptions } from '../../../core/output'

export default defineCommand({
  meta: { name: 'long', description: 'Open or increase a long perp position on Hyperliquid' },
  args: withDefaultArgs({
    ...marketBaseArgs,
    coin: {
      type: 'positional',
      description: 'Trading pair symbol, e.g. BTC, ETH',
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
    const out = createOutput(resolveOutputOptions(args))
    const result = await executePerpOrderCommand(args, { side: 'long', close: false }, out)
    renderPerpOrderResult(result, out)
  },
})
