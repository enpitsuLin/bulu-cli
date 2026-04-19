import { defineCommand } from 'citty'

export default defineCommand({
  meta: { name: 'market', description: 'Hyperliquid market data and trading' },
  subCommands: {
    price: () => import('./price').then((m) => m.default),
  },
})
