import { defineCommand } from 'citty'
import { getVaultPath, useConfig } from '#/core/config'
import { withArgs } from '#/core/args'
import { useOutput, outputArgs } from '#/core/output'
import { resolveTCXPassphrase } from '#/core/tcx'
import { resolveWalletAddress } from '#/core/wallet'
import { hyperliquidClientArgs } from '#/plugins/hyperliquid-client'
import {
  buildPerpMarketLookup,
  type HyperliquidCancelResponse,
  resolvePerpDexIndex,
  resolvePerpMarket,
  useHyperliquidClient,
} from '#/protocol/hyperliquid'

export default defineCommand({
  meta: { name: 'cancel-all', description: 'Cancel all open perp orders, optionally filtered by coin' },
  args: withArgs(
    {
      coin: {
        type: 'positional',
        description: 'Optional perp coin, for example BTC or ETH',
        required: false,
      },
      wallet: {
        type: 'string',
        description: 'Wallet name or id; defaults to config.default.wallet',
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

      const dex = args.dex?.trim() ?? ''
      const perpDexIndex = dex ? resolvePerpDexIndex(await client.getPerpDexs(), dex) : 0
      const perpMeta = await client.getPerpMeta(dex)
      const lookup = buildPerpMarketLookup(perpMeta, perpDexIndex)
      const targetMarket = args.coin ? resolvePerpMarket(lookup, args.coin) : null
      const vaultPath = getVaultPath()
      const address = resolveWalletAddress(walletName, vaultPath)
      const orders = await client.getOpenOrders(address, dex)
      const perpOrders = orders.filter(
        (order) =>
          lookup.byCoin.has(order.coin.toUpperCase()) &&
          (!targetMarket || order.coin.toUpperCase() === targetMarket.coin.toUpperCase()),
      )

      if (perpOrders.length === 0) {
        output.warn('No open perp orders to cancel')
        return
      }

      const cancels = perpOrders.map((order) => {
        const market = lookup.byCoin.get(order.coin.toUpperCase())
        if (!market) {
          throw new Error(`Failed to resolve asset for coin "${order.coin}"`)
        }
        return { a: market.asset, o: order.oid }
      })

      const credential = await resolveTCXPassphrase()
      const { response } = await client.submitL1Action<HyperliquidCancelResponse>({
        walletName,
        credential,
        vaultPath,
        action: { type: 'cancel', cancels },
      })

      const statuses = Array.isArray(response.data?.statuses) ? response.data.statuses : []
      const successCount = statuses.filter((status) => status === 'success').length
      const errorCount = statuses.length - successCount

      if (errorCount === 0) {
        output.success(`Cancelled ${successCount} perp order${successCount !== 1 ? 's' : ''}`)
      } else {
        output.warn(`Cancelled ${successCount}, ${errorCount} failed`)
      }

      output.data(response)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      output.warn(`Error: ${message}`)
      process.exit(1)
    }
  },
})
