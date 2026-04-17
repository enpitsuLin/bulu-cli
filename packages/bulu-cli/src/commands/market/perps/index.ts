import { defineCommand } from 'citty'

export default defineCommand({
  meta: { name: 'perps', description: 'Hyperliquid perpetual futures' },
  subCommands: {
    positions: () => import('./positions').then((m) => m.default),
    long: () => import('./long').then((m) => m.default),
    short: () => import('./short').then((m) => m.default),
    close: () => import('./close').then((m) => m.default),
    orders: () => import('./orders').then((m) => m.default),
  },
})
