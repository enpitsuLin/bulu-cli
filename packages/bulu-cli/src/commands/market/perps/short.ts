import { defineCommand } from 'citty'
import { resolvePerpOrderArgs, runPerpOrderCommand } from './shared'

export default defineCommand({
  meta: { name: 'short', description: 'Open or increase a short perp position on Hyperliquid' },
  args: resolvePerpOrderArgs('open'),
  async run({ args }) {
    await runPerpOrderCommand(args, { side: 'short', close: false })
  },
})
