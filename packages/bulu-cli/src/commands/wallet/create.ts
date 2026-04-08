import { createWallet } from '@bulu-cli/tcx-napi-rs'
import { defineCommand } from 'citty'
import { resolveTCXPassphrase } from '../../core/tcx'

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
    const wallet = createWallet({
      password: passphrase,
      name: args.name,
    })

    console.log({
      mnemonic: wallet.mnemonic,
      meta: wallet.meta,
      accounts: wallet.accounts,
    })
  },
})
