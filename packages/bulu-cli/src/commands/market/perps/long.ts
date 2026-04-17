import { defineCommand } from 'citty'
import { resolvePerpOrderArgs, runPerpOrderCommand } from './shared'

export default defineCommand({
  meta: { name: 'long', description: 'Open or increase a long perp position on Hyperliquid' },
  args: resolvePerpOrderArgs('open'),
  async run({ args }) {
    await runPerpOrderCommand(args, { side: 'long', close: false })
  },
})
