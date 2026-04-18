import { defineCommand } from 'citty'
import {
  buildCancelAction,
  fetchFrontendOpenOrders,
  fetchMarketAsset,
  fetchSpotMeta,
  partitionEntriesBySpot,
} from '../../../protocols/hyperliquid'
import type { FrontendOpenOrder } from '../../../protocols/hyperliquid'
import { findOrderByIdentifier } from './utils'
import { createOutput, resolveOutputOptions } from '../../../core/output'
import { resolvePerpQueryArgs, resolvePerpUserContext } from './shared'
import { loadDataOrExit } from '../../../utils/cli'
import { renderResult } from '../../../utils/output'
import { submitExchangeAction } from './shared'

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
    const out = createOutput(resolveOutputOptions(args))
    const { walletName, user } = resolvePerpUserContext(args, out)
    const coinFilter = args.coin ? String(args.coin).toUpperCase() : undefined

    if (!args.all && !args.id) {
      out.warn('Provide an order id or use --all')
      process.exit(1)
    }

    const [orders, spotMeta] = await Promise.all([
      loadDataOrExit(out, fetchFrontendOpenOrders(user, args.testnet), 'Failed to fetch open orders'),
      loadDataOrExit(out, fetchSpotMeta(args.testnet), 'Failed to fetch spot metadata'),
    ])

    const { perps, spot } = partitionEntriesBySpot(orders, spotMeta)
    const candidates = coinFilter ? perps.filter((order) => order.coin === coinFilter) : perps
    const selected = args.all
      ? candidates
      : (() => {
          const match = findOrderByIdentifier(candidates, String(args.id))
          return match ? [match] : []
        })()

    if (selected.length === 0) {
      const spotOrder = args.all ? undefined : findOrderByIdentifier(spot, String(args.id))
      if (spotOrder) {
        out.warn(`Order ${args.id} belongs to spot; use \`bulu market spot cancel\``)
        process.exit(1)
      }
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

    const response = await loadDataOrExit(
      out,
      submitExchangeAction({ action, walletName, testnet: args.testnet }),
      'Failed to cancel order',
    )

    const rows = selected.map((order: FrontendOpenOrder) => ({
      coin: order.coin,
      side: order.side === 'B' ? 'long' : 'short',
      size: order.sz,
      limitPx: order.limitPx,
      oid: order.oid,
      cloid: order.cloid ?? 'N/A',
    }))

    renderResult(out, args, {
      rows,
      dataKey: 'canceled',
      emptyMessage: '',
      columns: ['coin', 'side', 'size', 'limitPx', 'oid', 'cloid'],
      title: `Canceled Perp Orders | ${walletName} (${user})`,
      jsonData: { wallet: walletName, user, canceled: rows, response },
      walletName,
      user,
    })
  },
})
