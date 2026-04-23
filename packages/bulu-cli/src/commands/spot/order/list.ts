import { defineCommand } from 'citty'
import { getVaultPath, useConfig } from '#/core/config'
import { useOutput, withOutputArgs } from '#/core/output'
import { resolveWalletAddress } from '#/core/wallet'
import { formatSpotCoin, isSpotCoin, resolveSpotMarket, useHyperliquidClient } from '#/protocol/hyperliquid'

export default defineCommand({
  meta: { name: 'list', description: 'List open Hyperliquid spot orders' },
  args: withOutputArgs({
    market: {
      type: 'positional',
      description: 'Optional market alias, for example PURR/USDC or @1',
      required: false,
    },
    wallet: {
      type: 'string',
      description: 'Wallet name or id; defaults to config.default.wallet',
    },
    testnet: {
      type: 'boolean',
      description: 'Use Hyperliquid testnet when config.hyperliquid.apiBase is not set',
      default: false,
    },
  }),
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
      const targetMarket = args.market ? resolveSpotMarket(spotMeta, args.market) : null
      const vaultPath = getVaultPath()
      const address = resolveWalletAddress(walletName, vaultPath)
      const orders = await client.getOpenOrders(address)
      const rows = orders
        .filter((order) => isSpotCoin(spotMeta, order.coin))
        .filter((order) => !targetMarket || order.coin === targetMarket.canonicalName)
        .map((order) => ({
          Market: formatSpotCoin(spotMeta, order.coin),
          Oid: order.oid,
          Side: order.side === 'B' ? 'Buy' : 'Sell',
          Type: order.orderType,
          Tif: order.tif,
          'Limit Px': order.limitPx,
          Remaining: order.sz,
          Original: order.origSz,
          'Reduce Only': order.reduceOnly ? 'Yes' : 'No',
          Timestamp: order.timestamp,
        }))

      if (rows.length === 0) {
        output.warn('No open spot orders found')
        return
      }

      output.table(rows, {
        columns: [
          'Market',
          'Oid',
          'Side',
          'Type',
          'Tif',
          'Limit Px',
          'Remaining',
          'Original',
          'Reduce Only',
          'Timestamp',
        ],
        title: `Open Hyperliquid spot orders (${rows.length})${client.isTestnet ? ' [testnet]' : ' [mainnet]'}`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      output.warn(`Error: ${message}`)
      process.exit(1)
    }
  },
})
