import { defineCommand } from 'citty'
import { getVaultPath, useConfig } from '#/core/config'
import { withArgs } from '#/core/args'
import { useOutput, outputArgs } from '#/core/output'
import { resolveWalletAddress } from '#/core/wallet'
import { hyperliquidClientArgs } from '#/plugins/hyperliquid-client'
import { resolveCommandWallet } from '#/commands/hyperliquid'
import {
  buildPerpMarketLookup,
  formatPerpCoin,
  isPerpCoin,
  resolvePerpDexIndex,
  resolvePerpMarket,
  useHyperliquidClient,
} from '#/protocol/hyperliquid'

export default defineCommand({
  meta: { name: 'list', description: 'List open Hyperliquid perpetual orders' },
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
      const walletName = resolveCommandWallet(args.wallet, config.config.default?.wallet)

      const dex = args.dex?.trim() ?? ''
      const perpDexIndex = dex ? resolvePerpDexIndex(await client.getPerpDexs(), dex) : 0
      const perpMeta = await client.getPerpMeta(dex)
      const lookup = buildPerpMarketLookup(perpMeta, perpDexIndex)
      const targetMarket = args.coin ? resolvePerpMarket(lookup, args.coin) : null
      const vaultPath = getVaultPath()
      const address = resolveWalletAddress(walletName, vaultPath)
      const orders = await client.getOpenOrders(address, dex)
      const rows = orders
        .filter((order) => isPerpCoin(lookup, order.coin))
        .filter((order) => !targetMarket || order.coin.toUpperCase() === targetMarket.coin.toUpperCase())
        .map((order) => ({
          Coin: formatPerpCoin(lookup, order.coin),
          Oid: order.oid,
          Cloid: order.cloid ?? '',
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
        output.warn('No open perp orders found')
        return
      }

      output.table(rows, {
        columns: [
          'Coin',
          'Oid',
          'Cloid',
          'Side',
          'Type',
          'Tif',
          'Limit Px',
          'Remaining',
          'Original',
          'Reduce Only',
          'Timestamp',
        ],
        title: `Open Hyperliquid perp orders (${rows.length})${dex ? ` [dex=${dex}]` : ''}${
          client.isTestnet ? ' [testnet]' : ' [mainnet]'
        }`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      output.warn(`Error: ${message}`)
      process.exit(1)
    }
  },
})
