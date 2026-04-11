import { deleteWallet } from '@bulu-cli/tcx-core'
import { defineCommand } from 'citty'
import { join } from 'node:path'
import { styleText } from 'node:util'
import { createOutput, resolveOutputOptions } from '../../core/output'
import { getConfigDir } from '../../core/config'

export interface WalletDeleteArgs {
  wallet: string
  confirm?: boolean
  json?: boolean
}

export default defineCommand({
  meta: { name: 'delete', description: 'Delete a wallet from the local vault' },
  args: {
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
    json: { type: 'boolean', default: false },
    format: { type: 'string', default: 'table' },
  },
  async run({ args }) {
    if (!args.confirm) {
      console.error(styleText('yellow', 'This will permanently delete the wallet. Pass --confirm to proceed.'))
      process.exit(1)
    }
    const vaultPath = join(getConfigDir(), 'vault')
    deleteWallet(args.name, vaultPath)
    const out = createOutput(resolveOutputOptions(args))
    out.success(`Deleted wallet "${args.name}"`)
  },
})
