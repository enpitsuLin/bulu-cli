import { defineCommand } from 'citty'
import { getVaultPath, useConfig } from '#/core/config'
import { withArgs } from '#/core/args'
import { useOutput, outputArgs } from '#/core/output'
import { resolveWalletAddress } from '#/core/wallet'
import { resolveTCXPassphrase } from '#/core/tcx'
import { hyperliquidClientArgs } from '#/plugins/hyperliquid-client'
import {
  buildPerpMarketLookup,
  formatPerpCoin,
  isPerpCoin,
  resolvePerpDexIndex,
  resolvePerpMarket,
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
  meta: { name: 'modify', description: 'Modify a Hyperliquid perpetual order' },
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
      price: {
        type: 'string',
        description: 'New limit price',
      },
      size: {
        type: 'string',
        description: 'New order size in contract/base units',
      },
      tif: {
        type: 'string',
        description: 'New time in force: gtc, ioc, alo',
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

      if (!args.price && !args.size && !args.tif) {
        throw new Error('At least one of --price, --size, or --tif must be provided')
      }

      const dex = args.dex?.trim() ?? ''
      const perpDexIndex = dex ? resolvePerpDexIndex(await client.getPerpDexs(), dex) : 0
      const perpMeta = await client.getPerpMeta(dex)
      const lookup = buildPerpMarketLookup(perpMeta, perpDexIndex)
      const market = resolvePerpMarket(lookup, args.coin)
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
      if (!isPerpCoin(lookup, originalOrder.coin)) {
        throw new Error(`Order ${args.id} is not a perp order`)
      }

      const resolvedCoin = formatPerpCoin(lookup, originalOrder.coin)
      if (resolvedCoin.toUpperCase() !== market.coin.toUpperCase()) {
        throw new Error(`Order ${args.id} belongs to ${resolvedCoin}, not ${market.coin}`)
      }

      const newPrice = args.price ? toHyperliquidWireValue(args.price) : originalOrder.limitPx
      const newSize = args.size ? toHyperliquidWireValue(args.size) : originalOrder.sz
      const newTif = args.tif ? normalizeTif(args.tif) : normalizeTif(originalOrder.tif)

      const action = {
        type: 'modify' as const,
        oid: orderId,
        order: {
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
        },
      }

      output.success('Modify perp order summary')
      output.data(`  Coin:  ${market.coin}`)
      output.data(`  Asset: ${market.asset}`)
      output.data(`  Oid:   ${args.id}`)
      output.data(`  Side:  ${originalOrder.side === 'B' ? 'Buy' : 'Sell'}`)
      output.data(`  Size:  ${newSize} (was ${originalOrder.sz})`)
      output.data(`  Price: ${newPrice} (was ${originalOrder.limitPx})`)
      output.data(`  TIF:   ${newTif} (was ${originalOrder.tif})`)

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
