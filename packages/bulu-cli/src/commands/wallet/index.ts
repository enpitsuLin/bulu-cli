import { defineCommand } from 'citty'

export default defineCommand({
  meta: { name: 'wallet', description: 'Wallet management' },
  subCommands: {
    create: () => import('./create').then((m) => m.default),
  },
})
