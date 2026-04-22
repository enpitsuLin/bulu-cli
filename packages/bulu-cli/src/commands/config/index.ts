import { defineCommand } from 'citty'

export default defineCommand({
  meta: { name: 'config', description: 'Manage CLI configuration' },
  subCommands: {
    get: () => import('./get').then((m) => m.default),
    set: () => import('./set').then((m) => m.default),
    list: () => import('./list').then((m) => m.default),
  },
})
