import { defineCommand } from 'citty'

export default defineCommand({
  meta: { name: 'wallet', description: 'Wallet management' },
  subCommands: {
    create: () => import('./create').then((m) => m.default),
    import: () => import('./import').then((m) => m.default),
    export: () => import('./export').then((m) => m.default),
    info: () => import('./info').then((m) => m.default),
    delete: () => import('./delete').then((m) => m.default),
    list: () => import('./list').then((m) => m.default),
    switch: () => import('./switch').then((m) => m.default),
  },
})
