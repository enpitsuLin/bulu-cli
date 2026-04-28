import { defineCommand } from 'citty'
import { getVaultPath, useConfig } from '#/core/config'
import { useOutput, withOutputArgs } from '#/core/output'
import { resolveTCXPassphrase } from '#/core/tcx'
import { withHyperliquidClientArgs } from '#/plugins/hyperliquid-client'
import { type HyperliquidCancelResponse, resolveSpotMarket, useHyperliquidClient } from '#/protocol/hyperliquid'

function parseOid(value: string): number {
  const oid = Number(value)
  if (!Number.isSafeInteger(oid) || oid < 0) {
    throw new Error(`Invalid order id "${value}"`)
  }

  return oid
}

export default defineCommand({
  meta: { name: 'cancel', description: 'Cancel a Hyperliquid spot order' },
  args: withHyperliquidClientArgs(
    withOutputArgs({
      market: {
        type: 'positional',
        description: 'Spot market, for example PURR/USDC or @1',
        required: true,
      },
      id: {
        type: 'positional',
        description: 'Order id or client order id',
        required: true,
      },
      wallet: {
        type: 'string',
        description: 'Wallet name or id; defaults to config.default.wallet',
      },
      cloid: {
        type: 'boolean',
        description: 'Interpret id as a client order id',
        default: false,
      },
    }),
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

      const spotMeta = await client.getSpotMeta()
      const market = resolveSpotMarket(spotMeta, args.market)
      const action = args.cloid
        ? {
            type: 'cancelByCloid' as const,
            cancels: [
              {
                asset: market.asset,
                cloid: args.id,
              },
            ],
          }
        : {
            type: 'cancel' as const,
            cancels: [
              {
                a: market.asset,
                o: parseOid(args.id),
              },
            ],
          }
      const vaultPath = getVaultPath()
      const credential = await resolveTCXPassphrase()
      const { response } = await client.submitL1Action<HyperliquidCancelResponse>({
        walletName,
        credential,
        vaultPath,
        action,
      })

      output.success(`Submitted cancel for ${market.displayName}`)
      output.data(response)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      output.warn(`Error: ${message}`)
      process.exit(1)
    }
  },
})
