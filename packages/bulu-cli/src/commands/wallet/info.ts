import { defineCommand } from 'citty'
import { getVaultPath } from '../../core/config'
import { resolveStoredWallet } from '../../core/wallet-store'
import { renderWalletDetail } from './shared'

export interface WalletInfoArgs {
  wallet: string
  json?: boolean
}

export async function runWalletInfo(args: WalletInfoArgs): Promise<void> {
  const vaultPath = getVaultPath()
  const storedWallet = resolveStoredWallet(args.wallet, vaultPath)
  renderWalletDetail(storedWallet.data, args, {
    includeAccountKeys: false,
    includeCurve: false,
  })
}

export default defineCommand({
  meta: { name: 'info', description: 'Show detailed information for a wallet' },
  args: {
    wallet: {
      type: 'positional',
      description: 'Wallet name or id',
      required: true,
    },
    json: {
      type: 'boolean',
      description: 'Output in JSON format',
      default: false,
    },
  },
  async run({ args }) {
    await runWalletInfo(args as WalletInfoArgs)
  },
})
