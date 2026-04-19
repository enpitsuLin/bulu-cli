import { createWallet } from '@bulu-cli/tcx-core'
import { defineCommand } from 'citty'
import { resolveTCXPassphrase } from '#/core/tcx'
import { getVaultPath, setActiveWallet, withConfigArgs } from '#/core/config'
import { useOutput } from '#/core/output'
import { withOutputArgs } from '#/core/output'
import { styleText } from 'node:util'

export interface WalletCreateArgs {
  name: string
}

export default defineCommand({
  meta: { name: 'create', description: 'Create a new wallet' },
  args: withOutputArgs(
    withConfigArgs({
      name: {
        type: 'positional',
        description: 'Wallet name',
        required: true,
      },
    }),
  ),
  async run({ args }) {
    const passphrase = await resolveTCXPassphrase()
    const vaultPath = getVaultPath()

    const out = useOutput()

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
