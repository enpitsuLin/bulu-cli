import {
  fetchFrontendOpenOrders,
  fetchSpotMeta,
  partitionEntriesBySpot,
  resolveOrderSide,
} from '../../../protocols/hyperliquid'
import type { FrontendOpenOrder } from '../../../protocols/hyperliquid'
import { formatTimestamp } from '../../../core/time'
import { createOutput, resolveOutputOptions } from '../../../core/output'
import { resolvePerpQueryArgs, resolvePerpUserContext } from './shared'
import { fetchListItems } from '../query-shared'

function mapOpenOrder(order: FrontendOpenOrder) {
  return {
    coin: order.coin,
    side: resolveOrderSide(order.side),
    size: order.sz,
    origSize: order.origSz,
    limitPx: order.limitPx,
    tif: order.isTrigger ? `trigger (${order.tif})` : order.tif,
    triggerPx: order.triggerPx ?? 'N/A',
    cloid: order.cloid ?? 'N/A',
    positionTpsl: order.isPositionTpsl ?? false,
    reduceOnly: order.reduceOnly,
    oid: order.oid,
    timestamp: formatTimestamp(order.timestamp),
  }
}

export default defineCommand({
  meta: { name: 'orders', description: 'Show open perp orders' },
  args: resolvePerpQueryArgs(),
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args))
    const { walletName, user } = resolvePerpUserContext(args, out)
    const coinFilter = args.coin ? String(args.coin).toUpperCase() : undefined

    const rows = await fetchListItems({
      out,
      fetchItems: async () => {
        const [orders, spotMeta] = await Promise.all([
          fetchFrontendOpenOrders(user, args.testnet),
          fetchSpotMeta(args.testnet),
        ])
        const { perps } = partitionEntriesBySpot(orders, spotMeta)
        return perps
      },
      filter: coinFilter ? (order) => order.coin === coinFilter : undefined,
      toRow: mapOpenOrder,
    })

    out.table(rows, {
      columns: [
        'coin',
        'side',
        'size',
        'origSize',
        'limitPx',
        'tif',
        'triggerPx',
        'positionTpsl',
        'reduceOnly',
        'oid',
        'cloid',
        'timestamp',
      ],
      title: `Open Perp Orders | ${walletName} (${user})`,
    })
  },
})
