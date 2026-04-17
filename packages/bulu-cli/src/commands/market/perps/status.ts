import { defineCommand } from 'citty'
import { fetchOrderStatus, parseOrderIdentifier, resolveOrderSide } from '../../../protocols/hyperliquid'
import { formatTimestamp } from '../../../core/time'
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

    let response
    try {
      response = await fetchOrderStatus({
        user,
        oid: parseOrderIdentifier(String(args.id)),
        isTestnet: args.testnet,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      out.warn(`Failed to fetch order status: ${message}`)
      process.exit(1)
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
