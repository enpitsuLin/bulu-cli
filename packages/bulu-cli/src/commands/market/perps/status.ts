import { defineCommand } from 'citty'
import {
  fetchOrderStatus,
  fetchSpotMeta,
  isSpotPairName,
  parseOrderIdentifier,
  resolveOrderSide,
} from '../../../protocols/hyperliquid'
import { formatTimestamp } from '../../../core/time'
import { createOutput, resolveOutputOptions } from '../../../core/output'
import { resolvePerpQueryArgs, resolvePerpUserContext } from './shared'
import { loadDataOrExit } from '../../../utils/cli'
import { renderSingleResult } from '../../../utils/output'

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
    const out = createOutput(resolveOutputOptions(args))
    const { walletName, user } = resolvePerpUserContext(args, out)

    const [response, spotMeta] = await loadDataOrExit(
      out,
      Promise.all([
        fetchOrderStatus({
          user,
          oid: parseOrderIdentifier(String(args.id)),
          isTestnet: args.testnet,
        }),
        fetchSpotMeta(args.testnet),
      ]),
      'Failed to fetch order status',
    )

    if (response && typeof response === 'object' && 'order' in response && response.order) {
      if (isSpotPairName(response.order.coin, spotMeta)) {
        out.warn(`Order ${args.id} belongs to spot; use \`bulu market spot orders\` or \`bulu market spot history\``)
        process.exit(1)
      }
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

      renderSingleResult(out, args, {
        row,
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
        jsonData: { wallet: walletName, user, query: String(args.id), status: response },
      })
      return
    }

    out.data(response)
  },
})
