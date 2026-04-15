import { defineCommand } from 'citty'

export default defineCommand({
  meta: { name: 'spot', description: 'Hyperliquid spot trading' },
  subCommands: {
    positions: () => import('./positions').then((m) => m.default),
  },
})
