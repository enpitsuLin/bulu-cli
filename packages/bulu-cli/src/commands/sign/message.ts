import { defineCommand } from 'citty'
import { signMessage } from '@bulu-cli/tcx-core'
import { getVaultPath } from '../../core/config'
import { createOutput } from '../../core/output'
import { withOutputArgs } from '../../core/output'
import { resolveTCXPassphrase } from '../../core/tcx'

export default defineCommand({
  meta: { name: 'message', description: 'Sign a message' },
  args: withOutputArgs({
    message: {
      type: 'positional',
      description: 'Message to sign',
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
  async run({ args }) {
    const vaultPath = getVaultPath()
    const out = createOutput()

    const passphrase = await resolveTCXPassphrase()

    try {
      const result = signMessage(args.wallet, args['chain-id'], args.message, passphrase, vaultPath)
      out.data({ signature: result.signature })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      out.warn(`Error: ${message}`)
      process.exit(1)
    }
  },
})
