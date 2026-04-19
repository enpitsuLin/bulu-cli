import { defineCommand } from 'citty'
import { signTypedData } from '@bulu-cli/tcx-core'
import { getVaultPath } from '#/core/config'
import { useOutput } from '#/core/output'
import { withOutputArgs } from '#/core/output'
import { resolveTCXPassphrase } from '#/core/tcx'

export default defineCommand({
  meta: { name: 'typed-data', description: 'Sign typed structured data (EIP-712 / TIP-712)' },
  args: withOutputArgs({
    'typed-data-json': {
      type: 'positional',
      description: 'Typed data JSON string (EIP-712 format)',
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
    const out = useOutput()

    const passphrase = await resolveTCXPassphrase()

    try {
      const result = signTypedData(args.wallet, args['chain-id'], args['typed-data-json'], passphrase, vaultPath)
      out.data({ signature: result.signature })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      out.warn(`Error: ${message}`)
      process.exit(1)
    }
  },
})
