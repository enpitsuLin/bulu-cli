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
  buildPerpMarketLookup,
  buildPerpMarketPriceFromMid,
  type HyperliquidPlaceOrderResponse,
  resolvePerpDexIndex,
  resolvePerpMarket,
  toHyperliquidWireValue,
  useHyperliquidClient,
} from '#/protocol/hyperliquid'

export default defineCommand({
  meta: { name: 'place', description: 'Place a Hyperliquid perpetual order' },
  args: withArgs(
    {
      coin: {
        type: 'positional',
        description: 'Perp coin, for example BTC or ETH',
        required: true,
      },
      side: {
        type: 'positional',
        description: 'Order side: buy or sell',
        required: true,
      },
      size: {
        type: 'positional',
        description: 'Order size in contract/base units',
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
      'reduce-only': {
        type: 'boolean',
        description: 'Place the order as reduce-only',
        default: false,
      },
      cloid: {
        type: 'string',
        description: 'Optional 16-byte client order id in hex form, for example 0x1234...',
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
      const market = resolvePerpMarket(buildPerpMarketLookup(perpMeta, perpDexIndex), args.coin)
      if (market.isDelisted) {
        throw new Error(`${market.coin} is delisted`)
      }

      const isBuy = normalizeOrderSide(args.side, { allowPositionAliases: true })
      const orderType = args.type.trim().toLowerCase()
      const size = toHyperliquidWireValue(args.size)

      let limitPx = args.price ? toHyperliquidWireValue(args.price) : ''
      let tif = normalizeTif(args.tif)

      if (orderType === 'market') {
        if (args.price) {
          throw new Error('Market orders do not accept --price')
        }

        const mids = await client.getAllMids(dex)
        const mid = mids[market.coin]
        if (!mid) {
          throw new Error(`No mid price available for ${market.coin}`)
        }

        limitPx = buildPerpMarketPriceFromMid(mid, isBuy, args.slippage, market.szDecimals)
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
            reduceOnly: args['reduce-only'],
            tif,
            cloid: args.cloid,
          }),
        ],
        grouping: 'na' as const,
      }
      output.success('Perp order summary')
      output.data(`  Coin:        ${market.coin}`)
      output.data(`  Asset:       ${market.asset}`)
      output.data(`  Side:        ${isBuy ? 'Buy' : 'Sell'}`)
      output.data(`  Size:        ${size}`)
      output.data(`  Price:       ${limitPx}`)
      output.data(`  Type:        ${orderType}`)
      output.data(`  TIF:         ${tif}`)
      output.data(`  Reduce Only: ${args['reduce-only'] ? 'Yes' : 'No'}`)

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
