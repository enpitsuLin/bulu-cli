import { defineCommand } from 'citty'

export default defineCommand({
  meta: { name: 'market', description: 'Market data queries' },
  subCommands: {
    price: () => import('./price').then((m) => m.default),
  },
})
