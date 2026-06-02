import { defineCommand } from 'citty'
import { getVaultPath, useConfig } from '#/core/config'
import { withArgs } from '#/core/args'
import { useOutput, outputArgs } from '#/core/output'
import { resolveTCXCredential } from '#/core/tcx'
import { hyperliquidClientArgs } from '#/plugins/hyperliquid-client'
import { parseOid, resolveCommandWallet } from '#/commands/hyperliquid'
import {
  buildPerpMarketLookup,
  type HyperliquidCancelResponse,
  resolvePerpDexIndex,
  resolvePerpMarket,
  useHyperliquidClient,
} from '#/protocol/hyperliquid'

export default defineCommand({
  meta: { name: 'cancel', description: 'Cancel a Hyperliquid perpetual order' },
  args: withArgs(
    {
      coin: {
        type: 'positional',
        description: 'Perp coin, for example BTC or ETH',
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
      dex: {
        type: 'string',
        description: 'Optional builder-deployed perp dex name',
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
      const walletName = resolveCommandWallet(args.wallet, config.config.default?.wallet)

      const dex = args.dex?.trim() ?? ''
      const perpDexIndex = dex ? resolvePerpDexIndex(await client.getPerpDexs(), dex) : 0
      const perpMeta = await client.getPerpMeta(dex)
      const market = resolvePerpMarket(buildPerpMarketLookup(perpMeta, perpDexIndex), args.coin)
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
      const credential = await resolveTCXCredential()
      const { response } = await client.submitL1Action<HyperliquidCancelResponse>({
        walletName,
        credential,
        vaultPath,
        action,
      })

      output.success(`Submitted perp cancel for ${market.coin}`)
      output.data(response)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      output.warn(`Error: ${message}`)
      process.exit(1)
    }
  },
})
