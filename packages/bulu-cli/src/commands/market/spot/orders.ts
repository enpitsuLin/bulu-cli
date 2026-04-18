import { defineCommand } from 'citty'
import { fetchFrontendOpenOrders, normalizeSpotPair, partitionEntriesBySpot } from '../../../protocols/hyperliquid'
import type { FrontendOpenOrder } from '../../../protocols/hyperliquid'
import { loadSpotPairNameSetOrExit, resolveSpotOutput, resolveSpotQueryArgs, resolveSpotUserContext } from './shared'
import { runListCommand } from '../query-shared'
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
    timestamp: order.timestamp,
  }
}

function formatSpotOpenOrderRow(order: FrontendOpenOrder) {
  return {
    ...mapSpotOpenOrder(order),
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
    const out = resolveSpotOutput(args)
    const { walletName, user } = resolveSpotUserContext(args, out)
    const spotPairs = await loadSpotPairNameSetOrExit(args.testnet, out)
    const pairFilter = args.pair ? normalizeSpotPair(String(args.pair)) : undefined

    await runListCommand({
      out,
      args,
      walletName,
      user,
      fetchItems: async () => {
        const orders = await fetchFrontendOpenOrders(user, args.testnet)
        const { spot } = partitionEntriesBySpot(orders, spotPairs)
        return spot
      },
      filter: pairFilter ? (order) => order.coin === pairFilter : undefined,
      toRow: mapSpotOpenOrder,
      toDisplayRow: formatSpotOpenOrderRow,
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
      emptyMessage: `No open spot orders for ${walletName} (${user})`,
      dataKey: 'orders',
    })
  },
})
