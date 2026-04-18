import { defineCommand } from 'citty'
import {
  buildCancelAction,
  fetchFrontendOpenOrders,
  findSpotMarketAsset,
  normalizeSpotPair,
  partitionEntriesBySpot,
} from '../../../protocols/hyperliquid'
import { findOrderByIdentifier } from '../utils'
import { createOutput, resolveOutputOptions } from '../../../core/output'
import { loadSpotMarketStateOrExit, resolveSpotQueryArgs, resolveSpotUserContext } from './shared'
import { loadDataOrExit } from '../../../utils/cli'
import { renderResult } from '../../../utils/output'
import { submitExchangeAction } from '../shared'

export default defineCommand({
  meta: { name: 'cancel', description: 'Cancel open spot orders' },
  args: resolveSpotQueryArgs({
    id: {
      type: 'positional',
      description: 'Order id or client order id',
      required: false,
    },
    pair: {
      type: 'string',
      description: 'Restrict cancellation to a specific spot pair',
    },
    all: {
      type: 'boolean',
      description: 'Cancel all open spot orders, optionally filtered by --pair',
      default: false,
    },
  }),
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args))
    const { walletName, user } = resolveSpotUserContext(args, out)
    const pairFilter = args.pair ? normalizeSpotPair(String(args.pair)) : undefined

    if (!args.all && !args.id) {
      out.warn('Provide an order id or use --all')
      process.exit(1)
    }

    const [spotMarket, orders] = await Promise.all([
      loadSpotMarketStateOrExit(args.testnet, out),
      loadDataOrExit(out, fetchFrontendOpenOrders(user, args.testnet), 'Failed to fetch open orders'),
    ])

    const { spot } = partitionEntriesBySpot(orders, spotMarket.meta)
    const candidates = pairFilter ? spot.filter((order) => order.coin === pairFilter) : spot
    const selected = args.all
      ? candidates
      : (() => {
          const match = findOrderByIdentifier(candidates, String(args.id))
          return match ? [match] : []
        })()

    if (selected.length === 0) {
      out.warn(args.all ? 'No matching open spot orders to cancel' : `Spot order not found: ${args.id}`)
      process.exit(1)
    }

    const action = buildCancelAction(
      selected.map((order) => ({
        a: findSpotMarketAsset(order.coin, spotMarket).assetIndex,
        o: order.oid,
      })),
    )

    const response = await loadDataOrExit(
      out,
      submitExchangeAction({ action, walletName, testnet: args.testnet }),
      'Failed to cancel order',
    )

    const rows = selected.map((order) => ({
      pair: order.coin,
      side: order.side === 'B' ? 'buy' : 'sell',
      size: order.sz,
      origSize: order.origSz,
      limitPx: order.limitPx,
      tif: order.isTrigger ? `trigger (${order.tif})` : order.tif,
      triggerPx: order.triggerPx ?? 'N/A',
      reduceOnly: order.reduceOnly,
      oid: order.oid,
      cloid: order.cloid ?? 'N/A',
      timestamp: order.timestamp,
    }))

    renderResult(out, args, {
      rows,
      dataKey: 'canceled',
      emptyMessage: '',
      columns: [
        'pair',
        'side',
        'size',
        'origSize',
        'limitPx',
        'tif',
        'triggerPx',
        'reduceOnly',
        'oid',
        'cloid',
        'timestamp',
      ],
      title: `Canceled Spot Orders | ${walletName} (${user})`,
      jsonData: { wallet: walletName, user, canceled: rows, response },
      walletName,
      user,
    })
  },
})
