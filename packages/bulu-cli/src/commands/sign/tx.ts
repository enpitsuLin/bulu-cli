import { defineCommand } from 'citty'
import { signTransaction } from '@bulu-cli/tcx-core'
import { getVaultPath, withConfigArgs } from '#/core/config'
import { useOutput } from '#/core/output'
import { withOutputArgs } from '#/core/output'
import { resolveTCXPassphrase } from '#/core/tcx'

export default defineCommand({
  meta: { name: 'tx', description: 'Sign a transaction' },
  args: withOutputArgs(
    withConfigArgs({
      txHex: {
        type: 'positional',
        description: 'Unsigned transaction hex',
        required: true,
      },
      wallet: {
        type: 'string',
        description: 'Wallet name or id',
        required: true,
      },
      'chain-id': {
        type: 'string',
        description: 'CAIP-2 chain id, for example eip155:1 or tron:0x2b6653dc',
        required: true,
      },
    }),
  ),
  async run({ args }) {
    const vaultPath = getVaultPath()
    const out = useOutput()

    const passphrase = await resolveTCXPassphrase()

    try {
      const result = signTransaction(args.wallet, args['chain-id'], args.txHex, passphrase, vaultPath)
      out.data({ signature: result.signature })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      out.warn(`Error: ${message}`)
      process.exit(1)
    }
  },
})
