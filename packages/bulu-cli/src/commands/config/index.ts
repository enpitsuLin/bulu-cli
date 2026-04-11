import { defineCommand } from 'citty'

export default defineCommand({
  meta: { name: 'config', description: 'Manage CLI configuration' },
  subCommands: {
    init: () => import('./init').then((m) => m.default),
    get: () => import('./get').then((m) => m.default),
    set: () => import('./set').then((m) => m.default),
    list: () => import('./list').then((m) => m.default),
  },
})
