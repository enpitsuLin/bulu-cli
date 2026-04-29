import { defineCommand } from 'citty'
import { getVaultPath, useConfig } from '#/core/config'
import { withArgs } from '#/core/args'
import { useOutput, outputArgs } from '#/core/output'
import { resolveTCXPassphrase } from '#/core/tcx'
import { hyperliquidClientArgs } from '#/plugins/hyperliquid-client'
import { toHyperliquidWireValue, useHyperliquidClient } from '#/protocol/hyperliquid'

export default defineCommand({
  meta: { name: 'transfer', description: 'Transfer USDC between spot and perpetual accounts' },
  args: withArgs(
    {
      amount: {
        type: 'positional',
        description: 'USDC amount to transfer',
        required: true,
      },
      wallet: {
        type: 'string',
        description: 'Wallet name or id; defaults to config.default.wallet',
      },
      'to-perp': {
        type: 'boolean',
        description: 'Transfer from spot to perpetual',
        default: false,
      },
      'to-spot': {
        type: 'boolean',
        description: 'Transfer from perpetual to spot',
        default: false,
      },
    },
    outputArgs,
    hyperliquidClientArgs,
  ),
  async run({ args }) {
    const config = useConfig()
    const client = useHyperliquidClient()
    const output = useOutput()

    try {
      const walletName = args.wallet || config.config.default?.wallet
      if (!walletName) {
        throw new Error('Wallet is required; pass --wallet or set config.default.wallet')
      }

      const toPerpFlag = args['to-perp']
      const toSpotFlag = args['to-spot']

      if (toPerpFlag === toSpotFlag) {
        throw new Error('Specify either --to-perp or --to-spot')
      }

      const amount = toHyperliquidWireValue(args.amount)

      const vaultPath = getVaultPath()
      const credential = await resolveTCXPassphrase()

      const action = {
        type: 'usdClassTransfer' as const,
        hyperliquidChain: (client.isTestnet ? 'Testnet' : 'Mainnet') as 'Mainnet' | 'Testnet',
        signatureChainId: client.isTestnet ? '0x66eee' : '0xa4b1',
        amount,
        toPerp: toPerpFlag,
      }

      output.success('Transfer summary')
      output.data(`  Direction: ${toPerpFlag ? 'Spot → Perp' : 'Perp → Spot'}`)
      output.data(`  Amount:    ${amount} USDC`)
      output.data(`  Network:   ${client.isTestnet ? 'Testnet' : 'Mainnet'}`)

      const { response } = await client.submitUserAction<{ status: string }>({
        walletName,
        credential,
        vaultPath,
        action,
      })

      output.success('Transfer submitted')
      output.data(response)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      output.warn(`Error: ${message}`)
      process.exit(1)
    }
  },
})
