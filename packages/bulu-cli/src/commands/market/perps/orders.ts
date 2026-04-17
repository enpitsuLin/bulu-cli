import { defineCommand } from 'citty'
import { fetchFrontendOpenOrders, resolveOrderSide } from '../../../protocols/hyperliquid'
import { formatTimestamp } from '../../../core/time'
import type { FrontendOpenOrder } from '../../../protocols/hyperliquid'
import { resolvePerpOutput, resolvePerpQueryArgs, resolvePerpUserContext } from './shared'

function formatTif(tif: string, isTrigger: boolean): string {
  if (isTrigger) return `trigger (${tif})`
  return tif
}

function mapOpenOrder(order: FrontendOpenOrder) {
  return {
    coin: order.coin,
    side: resolveOrderSide(order.side),
    size: order.sz,
    origSize: order.origSz,
    limitPx: order.limitPx,
    tif: formatTif(order.tif, order.isTrigger),
    triggerPx: order.triggerPx ?? 'N/A',
    cloid: order.cloid ?? 'N/A',
    positionTpsl: order.isPositionTpsl ?? false,
    reduceOnly: order.reduceOnly,
    oid: order.oid,
    timestamp: order.timestamp,
  }
}

export function formatOpenOrderRows(orders: FrontendOpenOrder[]) {
  return orders.map((order) => ({
    ...mapOpenOrder(order),
    timestamp: formatTimestamp(order.timestamp),
  }))
}

export default defineCommand({
  meta: { name: 'orders', description: 'Show open perp orders' },
  args: resolvePerpQueryArgs(),
  async run({ args }) {
    const out = resolvePerpOutput(args)
    const { walletName, user } = resolvePerpUserContext(args, out)

    let orders: FrontendOpenOrder[] = []
    try {
      orders = await fetchFrontendOpenOrders(user, args.testnet)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      out.warn(`Failed to fetch open orders: ${message}`)
      process.exit(1)
    }

    const rawRows = (orders || []).map(mapOpenOrder)
    const displayRows = formatOpenOrderRows(orders || [])

    const isJson = args.json || args.format === 'json'
    const isCsv = args.format === 'csv'

    if (rawRows.length === 0) {
      if (isJson) {
        out.data({ wallet: walletName, user, orders: [] })
      } else {
        out.success(`No open perp orders for ${walletName} (${user})`)
      }
      return
    }

    if (isJson) {
      out.data({ wallet: walletName, user, orders: rawRows })
      return
    }

    if (isCsv) {
      const header = 'coin,side,size,origSize,limitPx,tif,triggerPx,positionTpsl,reduceOnly,oid,cloid,timestamp'
      out.data(header)
      for (const row of displayRows) {
        const line = `${row.coin},${row.side},${row.size},${row.origSize},${row.limitPx},${row.tif},${row.triggerPx},${row.positionTpsl},${row.reduceOnly},${row.oid},${row.cloid},${row.timestamp}`
        out.data(line)
      }
      return
    }

    out.table(displayRows, {
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
