import { defineCommand, runMain } from 'citty'
import OutputArgs from './plugins/0.output-args'

export const main = defineCommand({
  subCommands: {
    config: import('./commands/config/index').then((m) => m.default),
    wallet: import('./commands/wallet/index').then((m) => m.default),
    sign: import('./commands/sign/index').then((m) => m.default),
    market: import('./commands/market/index').then((m) => m.default),
  },
  plugins: [OutputArgs],
})

if (import.meta.main) {
  runMain(main)
}
