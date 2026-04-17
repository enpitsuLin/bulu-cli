import { defineCommand } from 'citty'

export default defineCommand({
  meta: { name: 'market', description: 'Hyperliquid market data and trading' },
  subCommands: {
    price: () => import('./price').then((m) => m.default),
    perps: () => import('./perps').then((m) => m.default),
    spot: () => import('./spot').then((m) => m.default),
  },
})
