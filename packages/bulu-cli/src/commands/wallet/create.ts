import { createWallet } from '@bulu-cli/tcx-core'
import { defineCommand } from 'citty'
import { resolveTCXPassphrase } from '../../core/tcx'
import { getVaultPath, setActiveWallet } from '../../core/config'
import { createOutput, resolveOutputOptions } from '../../core/output'
import { withDefaultArgs } from '../../core/args-def'
import { styleText } from 'node:util'

export interface WalletCreateArgs {
  name: string
}

export default defineCommand({
  meta: { name: 'create', description: 'Create a new wallet' },
  args: withDefaultArgs({
    name: {
      type: 'positional',
      description: 'Wallet name',
      required: true,
    },
  }),
  async run({ args }) {
    const passphrase = await resolveTCXPassphrase()
    const vaultPath = getVaultPath()

    const out = createOutput(resolveOutputOptions(args))

    let wallet
    try {
      wallet = createWallet(args.name, passphrase, vaultPath)
      setActiveWallet(wallet.meta.name)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      out.warn(`Error: ${message}`)
      process.exit(1)
    }

    out.data(`ID: ${wallet.meta.id}`)
    out.data(styleText('bold', 'Accounts'))

    // Print accounts table
    const accounts = wallet.accounts.map((a) => ({
      chain: a.chainId,
      address: a.address,
      path: a.derivationPath,
    }))

    out.table(accounts, {
      columns: ['chain', 'address', 'path'],
    })
  },
})
