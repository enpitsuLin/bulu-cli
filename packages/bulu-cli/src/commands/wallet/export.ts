import { defineCommand } from 'citty'
import { styleText } from 'node:util'
import { getVaultPath } from '../../core/config'
import { createOutput, resolveOutputOptions } from '../../core/output'
import { exportWallet } from '@bulu-cli/tcx-core'
import { withDefaultArgs } from '../../core/args-def'
import { resolveTCXPassphrase } from '../../core/tcx'

export default defineCommand({
  meta: { name: 'export', description: 'Export wallet mnemonic or private key' },
  args: withDefaultArgs({
    wallet: {
      type: 'positional',
      description: 'Wallet name or id',
      required: true,
    },
    confirm: {
      type: 'boolean',
      description: 'Confirm that you understand the security risks of exporting sensitive key material',
      required: false,
    },
  }),
  async run({ args }) {
    if (!args.confirm) {
      console.error(
        styleText('yellow', '⚠ WARNING: You are about to export sensitive key material (mnemonic or private key).'),
      )
      console.error(
        styleText('yellow', '  This action is irreversible and may compromise your wallet security if the exported'),
      )
      console.error(styleText('yellow', '  data is exposed. To proceed, rerun this command with the --confirm flag.'))
      process.exit(1)
    }

    const vaultPath = getVaultPath()
    const passphrase = await resolveTCXPassphrase()
    const exported = exportWallet(args.wallet, passphrase, vaultPath)

    const out = createOutput(resolveOutputOptions(args))

    out.warn('The following output contains sensitive key material. Do not share it.')

    out.data({ name: args.name, secret: exported })
  },
})
