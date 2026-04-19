import { defineCommand } from 'citty'
import { formatTimestamp } from '#/core/time'
import { createOutput, withOutputArgs } from '#/core/output'
import { cancelSpotOrders } from '../../../hyperliquid/features/spot/use-cases/spot'
import { marketBaseArgs } from '../../../hyperliquid/shared/args'
import { requireHyperliquidWalletContext } from '../../../hyperliquid/shared/context'
import { runHyperliquidCommand } from '../../../hyperliquid/shared/errors'

export default defineCommand({
  meta: { name: 'cancel', description: 'Cancel open spot orders' },
  args: withOutputArgs({
    ...marketBaseArgs,
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
    const out = createOutput()
    await runHyperliquidCommand(out, async () => {
      const ctx = requireHyperliquidWalletContext(args, out)
      const result = await cancelSpotOrders(ctx, {
        id: args.id ? String(args.id) : undefined,
        pair: args.pair ? String(args.pair) : undefined,
        all: args.all === true,
      })
      out.table(
        result.orders.map((order) => ({
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
        })),
        {
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
          title: `Canceled Spot Orders | ${result.walletName} (${result.user})`,
        },
      )
    })
  },
})
