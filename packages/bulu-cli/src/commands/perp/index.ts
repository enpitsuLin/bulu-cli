import { defineCommand } from 'citty'
import HyperliquidClient from '#/plugins/hyperliquid-client'

export default defineCommand({
  meta: { name: 'perp', description: 'Trade perpetual futures on Hyperliquid' },
  plugins: [HyperliquidClient],
  subCommands: {
    markets: () => import('./markets').then((m) => m.default),
    positions: () => import('./positions').then((m) => m.default),
    fills: () => import('./fills').then((m) => m.default),
    leverage: () => import('./leverage').then((m) => m.default),
    margin: () => import('./margin').then((m) => m.default),
    order: () => import('./order/index').then((m) => m.default),
  },
})
