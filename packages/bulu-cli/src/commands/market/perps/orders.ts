import { defineCommand } from 'citty'
import { formatTimestamp } from '#/core/time'
import { createOutput, withOutputArgs } from '#/core/output'
import { resolveOrderSide } from '../../../hyperliquid/domain/orders/resolve'
import { listPerpOrders } from '../../../hyperliquid/features/perps/use-cases/perps'
import { marketBaseArgs } from '../../../hyperliquid/shared/args'
import { requireHyperliquidWalletContext } from '../../../hyperliquid/shared/context'
import { runHyperliquidCommand } from '../../../hyperliquid/shared/errors'

export default defineCommand({
  meta: { name: 'orders', description: 'Show open perp orders' },
  args: withOutputArgs({
    ...marketBaseArgs,
    coin: {
      type: 'string',
      description: 'Filter orders by perp symbol',
    },
  }),
  async run({ args }) {
    const out = createOutput()
    await runHyperliquidCommand(out, async () => {
      const ctx = requireHyperliquidWalletContext(args, out)
      const result = await listPerpOrders(ctx, {
        coin: args.coin ? String(args.coin) : undefined,
      })
      out.table(
        result.orders.map((order) => ({
          coin: order.coin,
          side: resolveOrderSide(order.side),
          size: order.sz,
          origSize: order.origSz,
          limitPx: order.limitPx,
          tif: order.isTrigger ? `trigger (${order.tif})` : order.tif,
          triggerPx: order.triggerPx ?? 'N/A',
          positionTpsl: order.isPositionTpsl ?? false,
          reduceOnly: order.reduceOnly,
          oid: order.oid,
          cloid: order.cloid ?? 'N/A',
          timestamp: formatTimestamp(order.timestamp),
        })),
        {
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
          title: `Open Perp Orders | ${result.walletName} (${result.user})`,
        },
      )
    })
  },
})
