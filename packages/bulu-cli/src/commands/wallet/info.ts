import { defineCommand } from 'citty'
import { getVaultPath } from '../../core/config'
import { createOutput, resolveOutputOptions } from '../../core/output'
import { getWallet } from '@bulu-cli/tcx-core'
import { withDefaultArgs } from '../../core/args-def'

export default defineCommand({
  meta: { name: 'info', description: 'Show detailed information for a wallet' },
  args: withDefaultArgs({
    wallet: {
      type: 'positional',
      description: 'Wallet name or id',
      required: true,
    },
  }),
  async run({ args }) {
    const vaultPath = getVaultPath()
    const wallet = getWallet(args.wallet, vaultPath)

    const out = createOutput(resolveOutputOptions(args))

    out.data({
      name: wallet.meta.name,
      id: wallet.meta.id,
      accounts: wallet.accounts.map((a) => ({
        chain: a.chainId,
        address: a.address,
        path: a.derivationPath,
      })),
    })
  },
})
