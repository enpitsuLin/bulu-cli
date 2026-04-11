import { deleteWallet } from '@bulu-cli/tcx-core'
import { defineCommand } from 'citty'
import { join } from 'node:path'
import { createOutput, resolveOutputOptions } from '../../core/output'
import { getConfigDir } from '../../core/config'
import { withDefaultArgs } from '../../core/args-def'

export default defineCommand({
  meta: { name: 'delete', description: 'Delete a wallet from the local vault' },
  args: withDefaultArgs({
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
  }),
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args))
    if (!args.confirm) {
      out.warn('This will permanently delete the wallet. Pass --confirm to proceed.')
      process.exit(1)
    }
    const vaultPath = join(getConfigDir(), 'vault')
    deleteWallet(args.name, vaultPath)
    out.success(`Deleted wallet "${args.name}"`)
  },
})
