import { defineCommand } from 'citty'

export default defineCommand({
  meta: { name: 'sign', description: 'Sign transactions and messages' },
  subCommands: {
    tx: () => import('./tx').then((m) => m.default),
    message: () => import('./message').then((m) => m.default),
    'typed-data': () => import('./typed-data').then((m) => m.default),
  },
})
