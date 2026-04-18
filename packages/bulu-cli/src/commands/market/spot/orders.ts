import { defineCommand } from 'citty'
import { fetchFrontendOpenOrders, normalizeSpotPair, partitionEntriesBySpot } from '../../../protocols/hyperliquid'
import type { FrontendOpenOrder } from '../../../protocols/hyperliquid'
import { createOutput, resolveOutputOptions } from '../../../core/output'
import { loadSpotPairNameSetOrExit, resolveSpotQueryArgs, resolveSpotUserContext } from './shared'
import { fetchListItems } from '../query-shared'
import { formatTimestamp } from '../../../core/time'

function mapSpotOpenOrder(order: FrontendOpenOrder) {
  return {
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
    timestamp: formatTimestamp(order.timestamp),
  }
}

export default defineCommand({
  meta: { name: 'orders', description: 'Show open spot orders' },
  args: resolveSpotQueryArgs({
    pair: {
      type: 'string',
      description: 'Filter orders by exact Hyperliquid spot pair',
    },
  }),
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args))
    const { walletName, user } = resolveSpotUserContext(args, out)
    const spotPairs = await loadSpotPairNameSetOrExit(args.testnet, out)
    const pairFilter = args.pair ? normalizeSpotPair(String(args.pair)) : undefined

    const rows = await fetchListItems({
      out,
      fetchItems: async () => {
        const orders = await fetchFrontendOpenOrders(user, args.testnet)
        const { spot } = partitionEntriesBySpot(orders, spotPairs)
        return spot
      },
      filter: pairFilter ? (order) => order.coin === pairFilter : undefined,
      toRow: mapSpotOpenOrder,
    })

    out.table(rows, {
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
      title: `Open Spot Orders | ${walletName} (${user})`,
    })
  },
})
