import { createWallet } from '@bulu-cli/tcx-core'
import { defineCommand } from 'citty'
import { resolveTCXPassphrase } from '../../core/tcx'
import { getVaultPath } from '../../core/config'
import { getStoredWalletPath } from '../../core/wallet-store'

export interface WalletCreateArgs {
  name: string
}

export async function runWalletCreate(args: WalletCreateArgs): Promise<void> {
  const passphrase = await resolveTCXPassphrase()
  const vaultPath = getVaultPath()
  const wallet = createWallet(args.name, passphrase, vaultPath)
  const path = getStoredWalletPath(vaultPath, wallet.meta.id)

  console.log({
    meta: wallet.meta,
    accounts: wallet.accounts,
    path,
  })
}

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
    await runWalletCreate(args as WalletCreateArgs)
  },
})
