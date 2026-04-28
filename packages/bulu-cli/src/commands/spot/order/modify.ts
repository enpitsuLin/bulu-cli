import { defineCommand } from 'citty'
import { getVaultPath, useConfig } from '#/core/config'
import { useOutput, withOutputArgs } from '#/core/output'
import { resolveWalletAddress } from '#/core/wallet'
import { resolveTCXPassphrase } from '#/core/tcx'
import { withHyperliquidClientArgs } from '#/plugins/hyperliquid-client'
import {
  formatSpotCoin,
  isSpotCoin,
  resolveSpotMarket,
  toHyperliquidWireValue,
  type HyperliquidModifyResponse,
  useHyperliquidClient,
} from '#/protocol/hyperliquid'

function normalizeTif(tif: string): 'Alo' | 'Ioc' | 'Gtc' {
  const normalized = tif.trim().toLowerCase()
  if (normalized === 'alo') {
    return 'Alo'
  }
  if (normalized === 'ioc') {
    return 'Ioc'
  }
  if (normalized === 'gtc') {
    return 'Gtc'
  }

  throw new Error(`Unsupported tif "${tif}", expected gtc, ioc, or alo`)
}

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
  meta: { name: 'modify', description: 'Modify a Hyperliquid spot order' },
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
      price: {
        type: 'string',
        description: 'New limit price',
      },
      size: {
        type: 'string',
        description: 'New order size in base asset units',
      },
      tif: {
        type: 'string',
        description: 'New time in force: gtc, ioc, alo',
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

      if (!args.price && !args.size && !args.tif) {
        throw new Error('At least one of --price, --size, or --tif must be provided')
      }

      const spotMeta = await client.getSpotMeta()
      const market = resolveSpotMarket(spotMeta, args.market)
      const vaultPath = getVaultPath()
      const address = resolveWalletAddress(walletName, vaultPath)
      const orderId = parseOrderIdentifier(args.id)

      const statusResponse = await client.getOrderStatus(address, orderId)
      if (statusResponse.status === 'unknownOid') {
        output.warn(`Order ${args.id} not found`)
        process.exit(1)
      }

      const orderContainer = statusResponse.order
      const originalOrder = orderContainer?.order
      if (!originalOrder) {
        throw new Error('Unexpected Hyperliquid order status response')
      }
      if (!isSpotCoin(spotMeta, originalOrder.coin)) {
        throw new Error(`Order ${args.id} is not a spot order`)
      }

      const resolvedCoin = formatSpotCoin(spotMeta, originalOrder.coin)
      if (resolvedCoin !== market.displayName) {
        throw new Error(`Order ${args.id} belongs to ${resolvedCoin}, not ${market.displayName}`)
      }

      const newPrice = args.price ? toHyperliquidWireValue(args.price) : originalOrder.limitPx
      const newSize = args.size ? toHyperliquidWireValue(args.size) : originalOrder.sz
      const newTif = args.tif ? normalizeTif(args.tif) : normalizeTif(originalOrder.tif)

      const orderWire = {
        a: market.asset,
        b: originalOrder.side === 'B',
        p: newPrice,
        s: newSize,
        r: originalOrder.reduceOnly,
        t: {
          limit: {
            tif: newTif,
          },
        },
      }

      const action = {
        type: 'modify' as const,
        oid: orderId,
        order: orderWire,
      }

      output.success('Modify order summary')
      output.data(`  Market: ${market.displayName}`)
      output.data(`  Oid:    ${args.id}`)
      output.data(`  Side:   ${originalOrder.side === 'B' ? 'Buy' : 'Sell'}`)
      output.data(`  Size:   ${newSize} (was ${originalOrder.sz})`)
      output.data(`  Price:  ${newPrice} (was ${originalOrder.limitPx})`)
      output.data(`  TIF:    ${newTif} (was ${originalOrder.tif})`)

      const credential = await resolveTCXPassphrase()
      const { response } = await client.submitL1Action<HyperliquidModifyResponse>({
        walletName,
        credential,
        vaultPath,
        action,
      })

      output.success(`Modify submitted: ${response.data.status}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      output.warn(`Error: ${message}`)
      process.exit(1)
    }
  },
})
