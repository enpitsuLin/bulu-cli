import { listWallet } from '@bulu-cli/tcx-core'
import { defineCommand } from 'citty'
import { dirname } from 'node:path'
import { clearDefaultWalletIfMatches, getVaultPath } from '../../core/config'
import { removeStoredWallet, resolveStoredWallet } from '../../core/wallet-store'
import { createWalletCommandOutput } from './shared'

export interface WalletDeleteArgs {
  wallet: string
  force?: boolean
  json?: boolean
}

export async function runWalletDelete(args: WalletDeleteArgs): Promise<void> {
  if (!args.force) {
    throw new Error('Refusing to delete wallet without --force')
  }

  const vaultPath = getVaultPath()
  const storedWallet = resolveStoredWallet(args.wallet, vaultPath)

  removeStoredWallet(storedWallet.path)

  const remainingWallets = listWallet(vaultPath)
  const hasSiblingWithSameName = remainingWallets.some((wallet) => wallet.meta.name === storedWallet.wallet.meta.name)
  if (!hasSiblingWithSameName) {
    clearDefaultWalletIfMatches(storedWallet.wallet.meta.name, dirname(vaultPath))
  }

  const output = createWalletCommandOutput(args)
  output.success(`Deleted wallet "${storedWallet.wallet.meta.name}" (${storedWallet.wallet.meta.id})`)
}

export default defineCommand({
  meta: { name: 'delete', description: 'Delete a wallet from the local vault' },
  args: {
    wallet: {
      type: 'positional',
      description: 'Wallet name or id',
      required: true,
    },
    force: {
      type: 'boolean',
      description: 'Delete without an additional safeguard prompt',
      default: false,
    },
    json: {
      type: 'boolean',
      description: 'Output status in JSON format',
      default: false,
    },
  },
  async run({ args }) {
    await runWalletDelete(args as WalletDeleteArgs)
  },
})
