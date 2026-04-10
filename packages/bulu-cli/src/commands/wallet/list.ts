import { listWallet } from '@bulu-cli/tcx-core'
import { defineCommand } from 'citty'
import { getVaultPath } from '../../core/config'

export default defineCommand({
  meta: { name: 'list', description: 'List all wallets' },
  async run() {
    const vaultPath = getVaultPath()
    const wallets = listWallet(vaultPath)
    console.log(wallets)
  },
})
