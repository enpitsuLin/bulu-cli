import { defineCommand } from 'citty'
import { renderUnicodeCompact } from 'uqr'
import { getVaultPath } from '#/core/config'
import { createOutput } from '#/core/output'
import { exportEthKeystoreV3 } from '@bulu-cli/tcx-core'
import { withOutputArgs } from '#/core/output'
import { resolveTCXPassphrase } from '#/core/tcx'

export default defineCommand({
  meta: {
    name: 'export-keystore',
    description: 'Export Ethereum keystore V3 JSON',
  },
  args: withOutputArgs({
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
    keystorePassword: {
      type: 'string',
      description: 'Password to encrypt the exported keystore V3. Defaults to the wallet passphrase if omitted.',
      required: false,
    },
    qr: {
      type: 'boolean',
      description: 'Display the exported keystore as a QR code in the terminal',
      required: false,
    },
  }),
  async run({ args }) {
    const out = createOutput()
    if (!args.confirm) {
      out.warn(
        [
          'You are about to export an encrypted keystore V3 containing your Ethereum private key.',
          '  While the keystore is password-protected, exposing the file still poses a security risk.',
          '  To proceed, rerun this command with the --confirm flag.',
        ].join('\n'),
      )
      process.exit(1)
    }

    const vaultPath = getVaultPath()
    const walletPassphrase = await resolveTCXPassphrase()
    const keystorePassword = args.keystorePassword ?? walletPassphrase

    const exported = exportEthKeystoreV3(args.wallet, walletPassphrase, keystorePassword, vaultPath)

    out.warn('The following output contains encrypted key material. Handle it with care.')

    if (args.qr) {
      process.stdout.write('\n')
      process.stdout.write(renderUnicodeCompact(exported, { border: 1 }))
      process.stdout.write('\n')
    } else {
      process.stdout.write(exported)
    }
  },
})
