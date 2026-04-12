import { listWallet } from '@bulu-cli/tcx-core'
import { defineCommand } from 'citty'
import { getVaultPath, setActiveWallet } from '../../core/config'
import { createOutput, resolveOutputOptions } from '../../core/output'
import { withDefaultArgs } from '../../core/args-def'

export default defineCommand({
  meta: { name: 'switch', description: 'Switch active wallet' },
  args: withDefaultArgs({
    name: {
      type: 'positional',
      description: 'Wallet name to activate',
      required: true,
    },
  }),
  async run({ args }) {
    const vaultPath = getVaultPath()
    const wallets = listWallet(vaultPath)
    const output = createOutput(resolveOutputOptions(args))

    const wallet = wallets.find((w) => w.meta.name === args.name)
    if (!wallet) {
      output.warn(`Wallet "${args.name}" not found`)
      return
    }

    setActiveWallet(args.name)
    output.success(`Active wallet set to "${args.name}"`)
  },
})
