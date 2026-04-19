import { defineCommand } from 'citty'
import { withDefaultArgs } from '../../../core/args-def'
import { marketBaseArgs } from '../../../core/hyperliquid/command'
import { executePerpOrderCommand, renderPerpOrderResult } from '../../../core/hyperliquid/perps'
import { createOutput, resolveOutputOptions } from '../../../core/output'

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
    const out = createOutput(resolveOutputOptions(args))
    const result = await executePerpOrderCommand(args, { close: true }, out)
    renderPerpOrderResult(result, out)
  },
})
