import { listWallet } from '@bulu-cli/tcx-core'
import { defineCommand } from 'citty'
import { getVaultPath, setActiveWallet, withConfigArgs } from '#/core/config'
import { useOutput } from '#/core/output'
import { withOutputArgs } from '#/core/output'

export default defineCommand({
  meta: { name: 'switch', description: 'Switch active wallet' },
  args: withOutputArgs(
    withConfigArgs({
      name: {
        type: 'positional',
        description: 'Wallet name to activate',
        required: true,
      },
    }),
  ),
  async run({ args }) {
    const vaultPath = getVaultPath()
    const wallets = listWallet(vaultPath)
    const output = useOutput()

    const wallet = wallets.find((w) => w.meta.name === args.name)
    if (!wallet) {
      output.warn(`Wallet "${args.name}" not found`)
      return
    }

    setActiveWallet(args.name)
    output.success(`Active wallet set to "${args.name}"`)
  },
})
