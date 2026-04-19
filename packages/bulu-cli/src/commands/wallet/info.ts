import { defineCommand } from 'citty'
import { getVaultPath } from '#/core/config'
import { useOutput } from '#/core/output'
import { getWallet } from '@bulu-cli/tcx-core'
import { withOutputArgs } from '#/core/output'
import { styleText } from 'node:util'
import { formatTimestamp } from '#/core/time'

export default defineCommand({
  meta: { name: 'info', description: 'Show detailed information for a wallet' },
  args: withOutputArgs({
    wallet: {
      type: 'positional',
      description: 'Wallet name or id',
      required: true,
    },
  }),
  async run({ args }) {
    const vaultPath = getVaultPath()
    const wallet = getWallet(args.wallet, vaultPath)

    const out = useOutput()

    const created = formatTimestamp(wallet.meta.timestamp)

    out.data(`Name: ${wallet.meta.name}`)
    out.data(`ID: ${wallet.meta.id}`)
    out.data(`Created: ${created}`)
    out.data(styleText('bold', 'Accounts'))

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
