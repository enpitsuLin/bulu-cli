import { defineCommand } from 'citty'
import SpotClient from '#/plugins/spot-client'

export default defineCommand({
  meta: { name: 'spot', description: 'Trade spot markets on Hyperliquid' },
  plugins: [SpotClient],
  subCommands: {
    markets: () => import('./markets').then((m) => m.default),
    balances: () => import('./balances').then((m) => m.default),
    order: () => import('./order/index').then((m) => m.default),
  },
})
