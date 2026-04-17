import { defineCommand } from 'citty'

export default defineCommand({
  meta: { name: 'spot', description: 'Hyperliquid spot trading' },
  subCommands: {
    pairs: () => import('./pairs').then((m) => m.default),
    positions: () => import('./positions').then((m) => m.default),
    buy: () => import('./buy').then((m) => m.default),
    sell: () => import('./sell').then((m) => m.default),
    orders: () => import('./orders').then((m) => m.default),
    cancel: () => import('./cancel').then((m) => m.default),
    fills: () => import('./fills').then((m) => m.default),
    history: () => import('./history').then((m) => m.default),
  },
})
