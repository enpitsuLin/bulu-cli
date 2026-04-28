import { defineCommand } from 'citty'
import HyperliquidClient from '#/plugins/hyperliquid-client'

export default defineCommand({
  meta: { name: 'spot', description: 'Trade spot markets on Hyperliquid' },
  plugins: [HyperliquidClient],
  subCommands: {
    markets: () => import('./markets').then((m) => m.default),
    balances: () => import('./balances').then((m) => m.default),
    fills: () => import('./fills').then((m) => m.default),
    transfer: () => import('./transfer').then((m) => m.default),
    order: () => import('./order/index').then((m) => m.default),
  },
})
