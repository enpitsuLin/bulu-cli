import { defineCommand } from 'citty'
import { getVaultPath } from '../../core/config'
import { createOutput, resolveOutputOptions } from '../../core/output'
import { exportWallet } from '@bulu-cli/tcx-core'
import { withDefaultArgs } from '../../core/args-def'
import { resolveTCXPassphrase } from '../../core/tcx'
import { styleText } from 'node:util'

export default defineCommand({
  meta: { name: 'export', description: 'Export wallet mnemonic or private key' },
  args: withDefaultArgs({
    wallet: {
      type: 'positional',
      description: 'Wallet name or id',
      required: true,
    },
  }),
  async run({ args }) {
    const vaultPath = getVaultPath()
    const passphrase = await resolveTCXPassphrase()
    const exported = exportWallet(args.wallet, passphrase, vaultPath)

    const out = createOutput(resolveOutputOptions(args))

    console.error(
      styleText('yellow', 'WARNING: The following output contains sensitive key material. Do not share it.'),
    )

    out.data({ name: args.name, secret: exported })
  },
})
