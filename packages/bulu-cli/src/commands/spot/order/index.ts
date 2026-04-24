import { defineCommand } from 'citty'

export default defineCommand({
  meta: { name: 'order', description: 'Manage Hyperliquid spot orders' },
  subCommands: {
    place: () => import('./place').then((m) => m.default),
    cancel: () => import('./cancel').then((m) => m.default),
    list: () => import('./list').then((m) => m.default),
    status: () => import('./status').then((m) => m.default),
  },
})
