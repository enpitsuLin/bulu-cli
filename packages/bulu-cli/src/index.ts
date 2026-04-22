import { defineCommand, runMain } from 'citty'
import Config from './plugins/config'
import OutputArgs from './plugins/output-args'

export const main = defineCommand({
  subCommands: {
    config: import('./commands/config/index').then((m) => m.default),
    wallet: import('./commands/wallet/index').then((m) => m.default),
    sign: import('./commands/sign/index').then((m) => m.default),
  },
  plugins: [Config, OutputArgs],
})

if (import.meta.main) {
  runMain(main)
}
