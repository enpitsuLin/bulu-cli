import { defineCommand } from 'citty'
import { getVaultPath, useConfig } from '#/core/config'
import { withArgs } from '#/core/args'
import { useOutput, outputArgs } from '#/core/output'
import { resolveTCXPassphrase } from '#/core/tcx'
import { hyperliquidClientArgs } from '#/plugins/hyperliquid-client'
import {
  buildPerpMarketLookup,
  buildPerpMarketPriceFromMid,
  type HyperliquidPlaceOrderResponse,
  type PerpOrderWire,
  resolvePerpDexIndex,
  resolvePerpMarket,
  toHyperliquidWireValue,
  useHyperliquidClient,
} from '#/protocol/hyperliquid'

function normalizeSide(side: string): boolean {
  const normalized = side.trim().toLowerCase()
  if (normalized === 'buy' || normalized === 'bid' || normalized === 'b' || normalized === 'long') {
    return true
  }
  if (normalized === 'sell' || normalized === 'ask' || normalized === 'a' || normalized === 'short') {
    return false
  }

  throw new Error(`Unsupported side "${side}", expected buy or sell`)
}

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
      const walletName = args.wallet || config.config.default?.wallet
      if (!walletName) {
        throw new Error('Wallet is required; pass --wallet or set config.default.wallet')
      }

      const dex = args.dex?.trim() ?? ''
      const perpDexIndex = dex ? resolvePerpDexIndex(await client.getPerpDexs(), dex) : 0
      const perpMeta = await client.getPerpMeta(dex)
      const market = resolvePerpMarket(buildPerpMarketLookup(perpMeta, perpDexIndex), args.coin)
      if (market.isDelisted) {
        throw new Error(`${market.coin} is delisted`)
      }

      const isBuy = normalizeSide(args.side)
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

      if (args.cloid && !/^0x[0-9a-f]{32}$/i.test(args.cloid)) {
        throw new Error('cloid must be 16 bytes in hex, e.g. 0x1234...abcd')
      }

      const orderWire: PerpOrderWire = {
        a: market.asset,
        b: isBuy,
        p: limitPx,
        s: size,
        r: args['reduce-only'],
        t: {
          limit: {
            tif,
          },
        },
      }

      if (args.cloid) {
        orderWire.c = args.cloid
      }

      const action = {
        type: 'order' as const,
        orders: [orderWire],
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
      const credential = await resolveTCXPassphrase()
      const { response } = await client.submitL1Action<HyperliquidPlaceOrderResponse>({
        walletName,
        credential,
        vaultPath,
        action,
      })

      for (const status of response.data.statuses) {
        if ('error' in status) {
          output.warn(`Order rejected: ${status.error}`)
        } else if ('filled' in status) {
          output.success(`Filled ${status.filled.totalSz} @ ${status.filled.avgPx} (oid=${status.filled.oid})`)
        } else if ('resting' in status) {
          output.success(`Order resting (oid=${status.resting.oid})`)
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      output.warn(`Error: ${message}`)
      process.exit(1)
    }
  },
})
