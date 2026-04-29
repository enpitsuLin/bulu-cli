import { defineCommand } from 'citty'
import { getVaultPath } from '#/core/config'
import { withArgs } from '#/core/args'
import { useOutput, outputArgs } from '#/core/output'
import { exportWallet } from '@bulu-cli/tcx-core'
import { resolveTCXPassphrase } from '#/core/tcx'

export default defineCommand({
  meta: { name: 'export', description: 'Export wallet mnemonic or private key' },
  args: withArgs(
    {
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
    },
    outputArgs,
  ),
  async run({ args }) {
    const out = useOutput()
    if (!args.confirm) {
      out.warn(
        [
          'You are about to export sensitive key material (mnemonic or private key).',
          '  This action is irreversible and may compromise your wallet security if the exported',
          '  data is exposed. To proceed, rerun this command with the --confirm flag.',
        ].join('\n'),
      )
      process.exit(1)
    }

    const vaultPath = getVaultPath()
    const passphrase = await resolveTCXPassphrase()
    const exported = exportWallet(args.wallet, passphrase, vaultPath)

    out.warn('The following output contains sensitive key material. Do not share it.')

    out.data({ name: args.name, secret: exported })
  },
})
