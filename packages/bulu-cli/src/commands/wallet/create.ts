import { createWallet } from '@bulu-cli/tcx-core'
import { defineCommand } from 'citty'
import { resolveTCXPassphrase } from '../../core/tcx'
import { getVaultPath } from '../../core/config'
import { createOutput, resolveOutputOptions } from '../../core/output'

export interface WalletCreateArgs {
  name: string
}

export default defineCommand({
  meta: { name: 'create', description: 'Create a new wallet' },
  args: {
    name: {
      type: 'positional',
      description: 'Wallet name',
      required: true,
    },
    json: { type: 'boolean', default: false },
    format: { type: 'string', default: 'table' },
  },
  async run({ args }) {
    const passphrase = await resolveTCXPassphrase()
    const vaultPath = getVaultPath()
    const wallet = createWallet(args.name, passphrase, vaultPath)

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
