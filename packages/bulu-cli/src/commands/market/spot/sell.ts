import { defineCommand } from 'citty'
import { resolveSpotOrderArgs, runSpotOrderCommand } from './shared'

export default defineCommand({
  meta: { name: 'sell', description: 'Place a spot sell order on Hyperliquid' },
  args: resolveSpotOrderArgs(),
  async run({ args }) {
    await runSpotOrderCommand(args, 'sell')
  },
})
