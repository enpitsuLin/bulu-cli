import { defineCommand } from 'citty'
import { getVaultPath, useConfig } from '#/core/config'
import { withArgs } from '#/core/args'
import { useOutput, outputArgs } from '#/core/output'
import { resolveTCXCredential } from '#/core/tcx'
import { hyperliquidClientArgs } from '#/plugins/hyperliquid-client'
import {
  assertCloid,
  createHyperliquidOrderWire,
  normalizeOrderSide,
  normalizeTif,
  resolveCommandWallet,
  writePlaceOrderStatuses,
} from '#/commands/hyperliquid'
import {
  buildMarketPriceFromMid,
  type HyperliquidPlaceOrderResponse,
  resolveSpotMarket,
  toHyperliquidWireValue,
  useHyperliquidClient,
} from '#/protocol/hyperliquid'

export default defineCommand({
  meta: { name: 'place', description: 'Place a Hyperliquid spot order' },
  args: withArgs(
    {
      market: {
        type: 'positional',
        description: 'Spot market, for example PURR/USDC or @1',
        required: true,
      },
      side: {
        type: 'positional',
        description: 'Order side: buy or sell',
        required: true,
      },
      size: {
        type: 'positional',
        description: 'Order size in base asset units',
        required: true,
      },
      wallet: {
        type: 'string',
        description: 'Wallet name or id; defaults to config.default.wallet',
      },
      type: {
        type: 'string',
        description: 'Order type: limit or market',
        default: 'limit',
      },
      price: {
        type: 'string',
        description: 'Limit price; required for limit orders',
      },
      tif: {
        type: 'string',
        description: 'Time in force for limit orders: gtc, ioc, alo',
        default: 'gtc',
      },
      slippage: {
        type: 'string',
        description: 'Market-order slippage as a decimal ratio, for example 0.03',
        default: '0.03',
      },
      cloid: {
        type: 'string',
        description: 'Optional 16-byte client order id in hex form, for example 0x1234...',
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

      const spotMeta = await client.getSpotMeta()
      const market = resolveSpotMarket(spotMeta, args.market)
      const isBuy = normalizeOrderSide(args.side)
      const orderType = args.type.trim().toLowerCase()
      const size = toHyperliquidWireValue(args.size)

      let limitPx = args.price ? toHyperliquidWireValue(args.price) : ''
      let tif = normalizeTif(args.tif)

      if (orderType === 'market') {
        if (args.price) {
          throw new Error('Market orders do not accept --price')
        }

        const mids = await client.getAllMids()
        const mid = mids[market.canonicalName]
        if (!mid) {
          throw new Error(`No mid price available for ${market.displayName}`)
        }

        limitPx = buildMarketPriceFromMid(mid, isBuy, args.slippage, market.szDecimals)
        tif = 'Ioc'
      } else if (orderType === 'limit') {
        if (!limitPx) {
          throw new Error('Limit orders require --price')
        }
      } else {
        throw new Error(`Unsupported order type "${args.type}", expected limit or market`)
      }

      if (args.cloid) {
        assertCloid(args.cloid)
      }

      const action = {
        type: 'order' as const,
        orders: [
          createHyperliquidOrderWire({
            asset: market.asset,
            isBuy,
            price: limitPx,
            size,
            reduceOnly: false,
            tif,
            cloid: args.cloid,
          }),
        ],
        grouping: 'na' as const,
      }
      output.success('Order summary')
      output.data(`  Market: ${market.displayName}`)
      output.data(`  Side:   ${isBuy ? 'Buy' : 'Sell'}`)
      output.data(`  Size:   ${size}`)
      output.data(`  Price:  ${limitPx}`)
      output.data(`  Type:   ${orderType}`)
      output.data(`  TIF:    ${tif}`)

      const vaultPath = getVaultPath()
      const credential = await resolveTCXCredential()
      const { response } = await client.submitL1Action<HyperliquidPlaceOrderResponse>({
        walletName,
        credential,
        vaultPath,
        action,
      })

      writePlaceOrderStatuses(output, response.data.statuses)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      output.warn(`Error: ${message}`)
      process.exit(1)
    }
  },
})
