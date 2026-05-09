import { defineCommand } from 'citty'
import { getVaultPath, useConfig } from '#/core/config'
import { withArgs } from '#/core/args'
import { useOutput, outputArgs } from '#/core/output'
import { resolveTCXPassphrase } from '#/core/tcx'
import { hyperliquidClientArgs } from '#/plugins/hyperliquid-client'
import {
  buildPerpMarketLookup,
  resolvePerpDexIndex,
  resolvePerpMarket,
  useHyperliquidClient,
} from '#/protocol/hyperliquid'

export default defineCommand({
  meta: { name: 'leverage', description: 'Update Hyperliquid perpetual leverage' },
  args: withArgs(
    {
      coin: {
        type: 'positional',
        description: 'Perp coin, for example BTC or ETH',
        required: true,
      },
      leverage: {
        type: 'positional',
        description: 'Integer leverage value',
        required: true,
      },
      wallet: {
        type: 'string',
        description: 'Wallet name or id; defaults to config.default.wallet',
      },
      cross: {
        type: 'boolean',
        description: 'Use cross margin',
        default: false,
      },
      isolated: {
        type: 'boolean',
        description: 'Use isolated margin',
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
      const walletName = args.wallet || config.config.default?.wallet
      if (!walletName) {
        throw new Error('Wallet is required; pass --wallet or set config.default.wallet')
      }

      if (args.cross === args.isolated) {
        throw new Error('Specify exactly one of --cross or --isolated')
      }

      const leverage = Number(args.leverage)
      if (!Number.isSafeInteger(leverage) || leverage <= 0) {
        throw new Error(`Invalid leverage "${args.leverage}"`)
      }

      const dex = args.dex?.trim() ?? ''
      const perpDexIndex = dex ? resolvePerpDexIndex(await client.getPerpDexs(), dex) : 0
      const perpMeta = await client.getPerpMeta(dex)
      const market = resolvePerpMarket(buildPerpMarketLookup(perpMeta, perpDexIndex), args.coin)
      if (leverage > market.maxLeverage) {
        throw new Error(`${market.coin} max leverage is ${market.maxLeverage}x`)
      }
      if (args.cross && market.onlyIsolated) {
        throw new Error(`${market.coin} only supports isolated margin`)
      }

      const vaultPath = getVaultPath()
      const credential = await resolveTCXPassphrase()
      const action = {
        type: 'updateLeverage' as const,
        asset: market.asset,
        isCross: args.cross,
        leverage,
      }

      output.success('Leverage update summary')
      output.data(`  Coin:     ${market.coin}`)
      output.data(`  Asset:    ${market.asset}`)
      output.data(`  Leverage: ${leverage}x`)
      output.data(`  Mode:     ${args.cross ? 'Cross' : 'Isolated'}`)

      const { response } = await client.submitL1Action<{ type: 'updateLeverage'; data: unknown }>({
        walletName,
        credential,
        vaultPath,
        action,
      })

      output.success('Leverage update submitted')
      output.data(response)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      output.warn(`Error: ${message}`)
      process.exit(1)
    }
  },
})
