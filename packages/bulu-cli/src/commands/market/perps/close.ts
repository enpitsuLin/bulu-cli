import { defineCommand } from 'citty'
import { resolvePerpOrderArgs, runPerpOrderCommand } from './shared'

export default defineCommand({
  meta: { name: 'close', description: 'Close or reduce a perp position on Hyperliquid' },
  args: resolvePerpOrderArgs('close'),
  async run({ args }) {
    await runPerpOrderCommand(args, { close: true })
  },
})
