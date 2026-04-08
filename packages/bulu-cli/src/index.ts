import { defineCommand, runMain } from 'citty'

export const main = defineCommand({
  subCommands: {
    wallet: import('./commands/wallet/index').then((m) => m.default),
  },
})

if (import.meta.main) {
  runMain(main)
}
