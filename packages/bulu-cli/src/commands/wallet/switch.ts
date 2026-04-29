import { listWallet } from '@bulu-cli/tcx-core'
import { defineCommand } from 'citty'
import { getVaultPath, useConfig } from '#/core/config'
import { withArgs } from '#/core/args'
import { useOutput, outputArgs } from '#/core/output'

export default defineCommand({
  meta: { name: 'switch', description: 'Switch active wallet' },
  args: withArgs(
    {
      name: {
        type: 'positional',
        description: 'Wallet name to activate',
        required: true,
      },
    },
    outputArgs,
  ),
  async run({ args }) {
    const vaultPath = getVaultPath()
    const wallets = listWallet(vaultPath)
    const output = useOutput()
    const config = useConfig()

    const wallet = wallets.find((w) => w.meta.name === args.name)
    if (!wallet) {
      output.warn(`Wallet "${args.name}" not found`)
      return
    }

    config.set('default.wallet', args.name)
    output.success(`Active wallet set to "${args.name}"`)
  },
})
