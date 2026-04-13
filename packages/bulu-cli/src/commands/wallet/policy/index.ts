import { defineCommand } from 'citty'

export default defineCommand({
  meta: { name: 'policy', description: 'Manage OWS signing policies' },
  subCommands: {
    create: () => import('./create').then((m) => m.default),
  },
})
