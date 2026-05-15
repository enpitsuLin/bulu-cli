import { defineCommand } from 'citty'
import { getVaultPath, useConfig } from '#/core/config'
import { withArgs } from '#/core/args'
import { useOutput, outputArgs } from '#/core/output'
import { resolveWalletAddress } from '#/core/wallet'
import { hyperliquidClientArgs } from '#/plugins/hyperliquid-client'
import { parseOrderIdentifier, resolveCommandWallet } from '#/commands/hyperliquid'
import {
  buildPerpMarketLookup,
  formatPerpCoin,
  isPerpCoin,
  resolvePerpDexIndex,
  useHyperliquidClient,
} from '#/protocol/hyperliquid'

export default defineCommand({
  meta: { name: 'status', description: 'Query Hyperliquid perpetual order status by oid or cloid' },
  args: withArgs(
    {
      id: {
        type: 'positional',
        description: 'Order id or client order id',
        required: true,
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
      const vaultPath = getVaultPath()
      const address = resolveWalletAddress(walletName, vaultPath)
      const response = await client.getOrderStatus(address, parseOrderIdentifier(args.id))

      if (response.status === 'unknownOid') {
        output.warn(`Order ${args.id} not found`)
        process.exit(1)
      }

      const orderContainer = response.order
      const order = orderContainer?.order
      if (!order) {
        throw new Error('Unexpected Hyperliquid order status response')
      }
      if (!isPerpCoin(lookup, order.coin)) {
        throw new Error(`Order ${args.id} is not a perp order`)
      }

      const rows = [
        {
          Coin: formatPerpCoin(lookup, order.coin),
          Oid: order.oid,
          Cloid: order.cloid ?? '',
          Status: orderContainer?.status,
          'Status Time': orderContainer?.statusTimestamp,
          Side: order.side === 'B' ? 'Buy' : 'Sell',
          Type: order.orderType,
          Tif: order.tif,
          'Limit Px': order.limitPx,
          Remaining: order.sz,
          Original: order.origSz,
          'Reduce Only': order.reduceOnly ? 'Yes' : 'No',
        },
      ]

      output.table(rows, {
        columns: [
          'Coin',
          'Oid',
          'Cloid',
          'Status',
          'Status Time',
          'Side',
          'Type',
          'Tif',
          'Limit Px',
          'Remaining',
          'Original',
          'Reduce Only',
        ],
        title: `Hyperliquid perp order status${dex ? ` [dex=${dex}]` : ''}${
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
