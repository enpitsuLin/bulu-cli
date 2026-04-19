import { defineCommand } from 'citty'
import { formatTimestamp } from '../../../core/time'
import { createOutput, withOutputArgs } from '../../../core/output'
import { listSpotOrders } from '../../../hyperliquid/features/spot/use-cases/spot'
import { marketBaseArgs } from '../../../hyperliquid/shared/args'
import { requireHyperliquidWalletContext } from '../../../hyperliquid/shared/context'
import { runHyperliquidCommand } from '../../../hyperliquid/shared/errors'

export default defineCommand({
  meta: { name: 'orders', description: 'Show open spot orders' },
  args: withOutputArgs({
    ...marketBaseArgs,
    pair: {
      type: 'string',
      description: 'Filter orders by exact Hyperliquid spot pair',
    },
  }),
  async run({ args }) {
    const out = createOutput()
    await runHyperliquidCommand(out, async () => {
      const ctx = requireHyperliquidWalletContext(args, out)
      const result = await listSpotOrders(ctx, {
        pair: args.pair ? String(args.pair) : undefined,
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
          title: `Open Spot Orders | ${result.walletName} (${result.user})`,
        },
      )
    })
  },
})
