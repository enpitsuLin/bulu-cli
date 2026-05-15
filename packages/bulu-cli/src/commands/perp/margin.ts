import { defineCommand } from 'citty'
import { getVaultPath, useConfig } from '#/core/config'
import { withArgs } from '#/core/args'
import { useOutput, outputArgs } from '#/core/output'
import { resolveTCXPassphrase } from '#/core/tcx'
import { hyperliquidClientArgs } from '#/plugins/hyperliquid-client'
import { resolveCommandWallet } from '#/commands/hyperliquid'
import {
  buildPerpMarketLookup,
  resolvePerpDexIndex,
  resolvePerpMarket,
  toHyperliquidUsdInt,
  toHyperliquidWireValue,
  useHyperliquidClient,
} from '#/protocol/hyperliquid'

function normalizePositionSide(side: string): boolean {
  const normalized = side.trim().toLowerCase()
  if (normalized === 'long' || normalized === 'buy' || normalized === 'b') {
    return true
  }
  if (normalized === 'short' || normalized === 'sell' || normalized === 's' || normalized === 'a') {
    return false
  }

  throw new Error(`Unsupported position side "${side}", expected long or short`)
}

export default defineCommand({
  meta: { name: 'margin', description: 'Add or remove isolated margin on a Hyperliquid perpetual position' },
  args: withArgs(
    {
      coin: {
        type: 'positional',
        description: 'Perp coin, for example BTC or ETH',
        required: true,
      },
      side: {
        type: 'positional',
        description: 'Position side: long or short',
        required: true,
      },
      amount: {
        type: 'positional',
        description: 'Positive USDC amount',
        required: true,
      },
      wallet: {
        type: 'string',
        description: 'Wallet name or id; defaults to config.default.wallet',
      },
      remove: {
        type: 'boolean',
        description: 'Remove margin instead of adding margin',
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

      const amount = toHyperliquidWireValue(args.amount)
      const rawAmount = toHyperliquidUsdInt(amount)
      if (rawAmount <= 0) {
        throw new Error('Margin amount must be positive; use --remove to remove margin')
      }

      const dex = args.dex?.trim() ?? ''
      const perpDexIndex = dex ? resolvePerpDexIndex(await client.getPerpDexs(), dex) : 0
      const perpMeta = await client.getPerpMeta(dex)
      const market = resolvePerpMarket(buildPerpMarketLookup(perpMeta, perpDexIndex), args.coin)
      const isBuy = normalizePositionSide(args.side)
      const ntli = args.remove ? -rawAmount : rawAmount
      const vaultPath = getVaultPath()
      const credential = await resolveTCXPassphrase()
      const action = {
        type: 'updateIsolatedMargin' as const,
        asset: market.asset,
        isBuy,
        ntli,
      }

      output.success('Isolated margin update summary')
      output.data(`  Coin:      ${market.coin}`)
      output.data(`  Asset:     ${market.asset}`)
      output.data(`  Side:      ${isBuy ? 'Long' : 'Short'}`)
      output.data(`  Direction: ${args.remove ? 'Remove' : 'Add'}`)
      output.data(`  Amount:    ${amount} USDC`)

      const { response } = await client.submitL1Action<{ type: 'updateIsolatedMargin'; data: unknown }>({
        walletName,
        credential,
        vaultPath,
        action,
      })

      output.success('Isolated margin update submitted')
      output.data(response)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      output.warn(`Error: ${message}`)
      process.exit(1)
    }
  },
})
