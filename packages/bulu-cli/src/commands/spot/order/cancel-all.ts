import { defineCommand } from 'citty'
import { getVaultPath, useConfig } from '#/core/config'
import { withArgs } from '#/core/args'
import { useOutput, outputArgs } from '#/core/output'
import { resolveTCXPassphrase } from '#/core/tcx'
import { resolveWalletAddress } from '#/core/wallet'
import { hyperliquidClientArgs } from '#/plugins/hyperliquid-client'
import {
  buildSpotMarketLookup,
  type HyperliquidCancelResponse,
  resolveSpotMarket,
  useHyperliquidClient,
} from '#/protocol/hyperliquid'

export default defineCommand({
  meta: { name: 'cancel-all', description: 'Cancel all open spot orders, optionally filtered by market' },
  args: withArgs(
    {
      market: {
        type: 'positional',
        description: 'Optional market alias, for example PURR/USDC or @1',
        required: false,
      },
      wallet: {
        type: 'string',
        description: 'Wallet name or id; defaults to config.default.wallet',
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

      const spotMeta = await client.getSpotMeta()
      const lookup = buildSpotMarketLookup(spotMeta)
      const vaultPath = getVaultPath()
      const address = resolveWalletAddress(walletName, vaultPath)
      const orders = await client.getOpenOrders(address)

      const targetMarket = args.market ? resolveSpotMarket(spotMeta, args.market) : null
      const spotOrders = orders.filter(
        (o) =>
          lookup.byCanonical.has(o.coin.toUpperCase()) &&
          (!targetMarket || o.coin.toUpperCase() === targetMarket.canonicalName.toUpperCase()),
      )

      if (spotOrders.length === 0) {
        output.warn('No open spot orders to cancel')
        return
      }

      const cancels = spotOrders.map((o) => {
        const market = lookup.byCanonical.get(o.coin.toUpperCase())
        if (!market) {
          throw new Error(`Failed to resolve asset for coin "${o.coin}"`)
        }
        return { a: market.asset, o: o.oid }
      })

      const credential = await resolveTCXPassphrase()
      const { response } = await client.submitL1Action<HyperliquidCancelResponse>({
        walletName,
        credential,
        vaultPath,
        action: { type: 'cancel', cancels },
      })

      const statuses = Array.isArray(response.data?.statuses) ? response.data.statuses : []
      const successCount = statuses.filter((s) => s === 'success').length
      const errorCount = statuses.length - successCount

      if (errorCount === 0) {
        output.success(`Cancelled ${successCount} order${successCount !== 1 ? 's' : ''}`)
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
