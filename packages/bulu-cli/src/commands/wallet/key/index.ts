import { defineCommand } from 'citty'

export default defineCommand({
  meta: { name: 'key', description: 'Manage API keys for agent-mode signing' },
  subCommands: {
    create: () => import('./create').then((m) => m.default),
  },
})
