import { listWallet, type WalletInfo } from '@bulu-cli/tcx-core'
import { defineCommand } from 'citty'
import { getVaultPath } from '../../core/config'
import { createOutput, resolveOutputOptions } from '../../core/output'
import { withDefaultArgs } from '../../core/args-def'

function formatWalletsForTable(wallets: WalletInfo[]) {
  return wallets.map((w) => ({
    Name: w.meta.name,
    ID: w.meta.id.slice(0, 16) + '...',
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
    const outputOpts = resolveOutputOptions(args)
    const output = createOutput(outputOpts)

    if (wallets.length === 0) {
      output.warn('No wallets found')
      return
    }

    if (outputOpts.json) {
      output.data(wallets)
      return
    }

    const rows = formatWalletsForTable(wallets)
    output.table(rows, {
      columns: ['Name', 'ID', 'Network', 'Source', 'Derivable', 'Accounts'],
      title: `Wallets (${wallets.length})`,
    })
  },
})
