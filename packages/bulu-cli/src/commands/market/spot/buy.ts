import { defineCommand } from 'citty'
import { resolveSpotOrderArgs, runSpotOrderCommand } from './shared'

export default defineCommand({
  meta: { name: 'buy', description: 'Place a spot buy order on Hyperliquid' },
  args: resolveSpotOrderArgs(),
  async run({ args }) {
    await runSpotOrderCommand(args, 'buy')
  },
})
