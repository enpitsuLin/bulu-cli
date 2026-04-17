import { defineCommand } from 'citty'
import {
  fetchOrderStatus,
  fetchSpotMeta,
  isSpotPairName,
  parseOrderIdentifier,
  resolveOrderSide,
} from '../../../protocols/hyperliquid'
import { formatTimestamp } from '../../../core/time'
import type { OrderStatusInfo, SpotMeta } from '../../../protocols/hyperliquid'
import { resolvePerpOutput, resolvePerpQueryArgs, resolvePerpUserContext } from './shared'

export default defineCommand({
  meta: { name: 'status', description: 'Query perp order status by oid or cloid' },
  args: resolvePerpQueryArgs({
    id: {
      type: 'positional',
      description: 'Order id or client order id',
      required: true,
    },
  }),
  async run({ args }) {
    const out = resolvePerpOutput(args)
    const { walletName, user } = resolvePerpUserContext(args, out)

    let response: OrderStatusInfo
    let spotMeta: SpotMeta
    try {
      ;[response, spotMeta] = await Promise.all([
        fetchOrderStatus({
          user,
          oid: parseOrderIdentifier(String(args.id)),
          isTestnet: args.testnet,
        }),
        fetchSpotMeta(args.testnet),
      ])
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      out.warn(`Failed to fetch order status: ${message}`)
      process.exit(1)
    }

    if (response && typeof response === 'object' && 'order' in response && response.order) {
      if (isSpotPairName(response.order.coin, spotMeta)) {
        out.warn(`Order ${args.id} belongs to spot; use \`bulu market spot orders\` or \`bulu market spot history\``)
        process.exit(1)
      }
    }

    const isJson = args.json || args.format === 'json'
    if (isJson) {
      out.data({
        wallet: walletName,
        user,
        query: String(args.id),
        status: response,
      })
      return
    }

    if (response && typeof response === 'object' && 'order' in response && response.order && 'status' in response) {
      const row = {
        coin: response.order.coin,
        status: String(response.status),
        side: resolveOrderSide(response.order.side),
        size: response.order.sz,
        limitPx: response.order.limitPx,
        isTrigger: response.order.isTrigger,
        reduceOnly: response.order.reduceOnly,
        oid: response.order.oid,
        cloid: response.order.cloid ?? 'N/A',
        statusTimestamp: 'statusTimestamp' in response ? formatTimestamp(Number(response.statusTimestamp)) : 'N/A',
      }

      if (args.format === 'csv') {
        out.data('coin,status,side,size,limitPx,isTrigger,reduceOnly,oid,cloid,statusTimestamp')
        out.data(
          `${row.coin},${row.status},${row.side},${row.size},${row.limitPx},${row.isTrigger},${row.reduceOnly},${row.oid},${row.cloid},${row.statusTimestamp}`,
        )
        return
      }

      out.table([row], {
        columns: [
          'coin',
          'status',
          'side',
          'size',
          'limitPx',
          'isTrigger',
          'reduceOnly',
          'oid',
          'cloid',
          'statusTimestamp',
        ],
        title: `Perp Order Status | ${walletName} (${user})`,
      })
      return
    }

    out.data(response)
  },
})
