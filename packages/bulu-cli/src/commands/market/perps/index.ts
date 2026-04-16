import { defineCommand } from 'citty'

export default defineCommand({
  meta: { name: 'perps', description: 'Hyperliquid perpetual futures' },
  subCommands: {
    positions: () => import('./positions').then((m) => m.default),
    order: () => import('./order').then((m) => m.default),
  },
})
