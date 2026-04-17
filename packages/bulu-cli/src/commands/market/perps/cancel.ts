import { defineCommand } from 'citty'
import {
  buildCancelAction,
  fetchFrontendOpenOrders,
  fetchMarketAsset,
  resolveOrderSide,
} from '../../../protocols/hyperliquid'
import { resolvePerpOutput, resolvePerpQueryArgs, resolvePerpUserContext, submitExchangeAction } from './shared'
import { findOrderByIdentifier } from './utils'

export default defineCommand({
  meta: { name: 'cancel', description: 'Cancel open perp orders' },
  args: resolvePerpQueryArgs({
    id: {
      type: 'positional',
      description: 'Order id or client order id',
      required: false,
    },
    coin: {
      type: 'string',
      description: 'Restrict cancellation to a specific perp symbol',
    },
    all: {
      type: 'boolean',
      description: 'Cancel all open perp orders, optionally filtered by --coin',
      default: false,
    },
  }),
  async run({ args }) {
    const out = resolvePerpOutput(args)
    const { walletName, user } = resolvePerpUserContext(args, out)
    const coinFilter = args.coin ? String(args.coin).toUpperCase() : undefined

    if (!args.all && !args.id) {
      out.warn('Provide an order id or use --all')
      process.exit(1)
    }

    let orders
    try {
      orders = await fetchFrontendOpenOrders(user, args.testnet)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      out.warn(`Failed to fetch open orders: ${message}`)
      process.exit(1)
    }

    const candidates = coinFilter ? orders.filter((order) => order.coin === coinFilter) : orders
    const selected = args.all
      ? candidates
      : (() => {
          const match = findOrderByIdentifier(candidates, String(args.id))
          return match ? [match] : []
        })()

    if (selected.length === 0) {
      out.warn(args.all ? 'No matching open orders to cancel' : `Order not found: ${args.id}`)
      process.exit(1)
    }

    const marketAssets = await Promise.all(
      [...new Set(selected.map((order) => order.coin))].map(
        async (coin) => [coin, await fetchMarketAsset(coin, args.testnet)] as const,
      ),
    )
    const assetIndexByCoin = new Map(marketAssets.map(([coin, market]) => [coin, market.assetIndex]))
    const action = buildCancelAction(
      selected.map((order) => ({
        a: assetIndexByCoin.get(order.coin) ?? 0,
        o: order.oid,
      })),
    )

    try {
      const response = await submitExchangeAction({
        action,
        walletName,
        testnet: args.testnet,
      })

      const rows = selected.map((order) => ({
        coin: order.coin,
        side: resolveOrderSide(order.side),
        size: order.sz,
        limitPx: order.limitPx,
        oid: order.oid,
        cloid: order.cloid ?? 'N/A',
      }))

      if (args.json || args.format === 'json') {
        out.data({
          wallet: walletName,
          user,
          canceled: rows,
          response,
        })
        return
      }

      if (args.format === 'csv') {
        out.data('coin,side,size,limitPx,oid,cloid')
        for (const row of rows) {
          out.data(`${row.coin},${row.side},${row.size},${row.limitPx},${row.oid},${row.cloid}`)
        }
        return
      }

      out.table(rows, {
        columns: ['coin', 'side', 'size', 'limitPx', 'oid', 'cloid'],
        title: `Canceled Perp Orders | ${walletName} (${user})`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      out.warn(`Failed to cancel order: ${message}`)
      process.exit(1)
    }
  },
})
