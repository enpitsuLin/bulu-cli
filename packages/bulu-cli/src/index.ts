import { defineCommand, runMain } from 'citty'

export const main = defineCommand({
  subCommands: {
    config: import('./commands/config/index').then((m) => m.default),
    wallet: import('./commands/wallet/index').then((m) => m.default),
  },
})

if (import.meta.main) {
  runMain(main)
}
