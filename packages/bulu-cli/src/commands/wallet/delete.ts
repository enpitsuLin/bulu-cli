import { deleteWallet } from '@bulu-cli/tcx-core'
import { defineCommand } from 'citty'
import { withArgs } from '#/core/args'
import { useOutput, outputArgs } from '#/core/output'
import { getVaultPath } from '#/core/config'

export default defineCommand({
  meta: { name: 'delete', description: 'Delete a wallet from the local vault' },
  args: withArgs(
    {
      name: {
        type: 'positional',
        description: 'Wallet name or ID',
        required: true,
      },
      confirm: {
        type: 'boolean',
        description: 'Confirm deletion',
        default: false,
      },
    },
    outputArgs,
  ),
  async run({ args }) {
    const out = useOutput()
    if (!args.confirm) {
      out.warn('This will permanently delete the wallet. Pass --confirm to proceed.')
      process.exit(1)
    }
    const vaultPath = getVaultPath()
    deleteWallet(args.name, vaultPath)
    out.success(`Deleted wallet "${args.name}"`)
  },
})
