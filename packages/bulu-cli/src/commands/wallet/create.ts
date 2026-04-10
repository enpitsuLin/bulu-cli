import { createWallet } from '@bulu-cli/tcx-core'
import { defineCommand } from 'citty'
import { resolveTCXPassphrase } from '../../core/tcx'
import { getVaultPath } from '../../core/config'

export default defineCommand({
  meta: { name: 'create', description: 'Create a new wallet' },
  args: {
    name: {
      type: 'positional',
      description: 'Wallet name',
      required: true,
    },
  },
  async run({ args }) {
    const passphrase = await resolveTCXPassphrase()
    const vaultPath = getVaultPath()
    const wallet = createWallet(args.name, passphrase, vaultPath)

    console.log({
      meta: wallet.meta,
      accounts: wallet.accounts,
    })
  },
})
