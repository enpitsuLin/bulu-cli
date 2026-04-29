import { defineCommand } from 'citty'
import { getVaultPath, useConfig } from '#/core/config'
import { withArgs } from '#/core/args'
import { useOutput, outputArgs } from '#/core/output'
import { resolveWalletAddress } from '#/core/wallet'
import { hyperliquidClientArgs } from '#/plugins/hyperliquid-client'
import { formatSpotCoin, isSpotCoin, useHyperliquidClient } from '#/protocol/hyperliquid'

function parseOrderIdentifier(value: string): number | string {
  if (/^0x[0-9a-f]{32}$/i.test(value)) {
    return value
  }

  if (value.startsWith('0x') || value.startsWith('0X')) {
    throw new Error(`Invalid cloid "${value}", expected 16 bytes in hex, e.g. 0x1234...abcd`)
  }

  const oid = Number(value)
  if (!Number.isSafeInteger(oid) || oid < 0) {
    throw new Error(`Invalid order id "${value}"`)
  }

  return oid
}

export default defineCommand({
  meta: { name: 'status', description: 'Query Hyperliquid spot order status by oid or cloid' },
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
      if (!isSpotCoin(spotMeta, order.coin)) {
        throw new Error(`Order ${args.id} is not a spot order`)
      }

      const rows = [
        {
          Market: formatSpotCoin(spotMeta, order.coin),
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
        },
      ]

      output.table(rows, {
        columns: [
          'Market',
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
        ],
        title: `Hyperliquid spot order status${client.isTestnet ? ' [testnet]' : ' [mainnet]'}`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      output.warn(`Error: ${message}`)
      process.exit(1)
    }
  },
})
