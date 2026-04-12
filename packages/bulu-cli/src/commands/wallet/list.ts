import { listWallet, type WalletInfo } from '@bulu-cli/tcx-core'
import { defineCommand } from 'citty'
import { getActiveWallet, getVaultPath } from '../../core/config'
import { createOutput, resolveOutputOptions } from '../../core/output'
import { withDefaultArgs } from '../../core/args-def'
import { styleText } from 'node:util'

function formatWalletsForTable(wallets: WalletInfo[], activeWallet?: string) {
  return wallets.map((w) => ({
    Name: w.meta.name,
    Active: w.meta.name === activeWallet ? styleText('cyan', '●') : '',
    Network: w.meta.network,
    Source: w.meta.source,
    Derivable: w.meta.derivable ? 'Yes' : 'No',
    Accounts: w.accounts.length,
  }))
}

export default defineCommand({
  meta: { name: 'list', description: 'List all wallets' },
  args: withDefaultArgs({}),
  async run({ args }) {
    const vaultPath = getVaultPath()
    const wallets = listWallet(vaultPath)
    const output = createOutput(resolveOutputOptions(args))

    if (wallets.length === 0) {
      output.warn('No wallets found')
      return
    }

    const activeWallet = getActiveWallet()
    const rows = formatWalletsForTable(wallets, activeWallet)
    output.table(rows, {
      columns: ['Name', 'Active', 'Network', 'Source', 'Derivable', 'Accounts'],
      title: `Wallets (${wallets.length})${activeWallet ? ` - Active: ${activeWallet}` : ''}`,
    })
  },
})
