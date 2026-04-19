import { defineCommand } from 'citty'
import { formatTimestamp } from '#/core/time'
import { createOutput, withOutputArgs } from '#/core/output'
import { resolveOrderSide } from '../../../hyperliquid/domain/orders/resolve'
import { getPerpOrderStatus } from '../../../hyperliquid/features/perps/use-cases/perps'
import { marketBaseArgs } from '../../../hyperliquid/shared/args'
import { requireHyperliquidWalletContext } from '../../../hyperliquid/shared/context'
import { runHyperliquidCommand } from '../../../hyperliquid/shared/errors'

export default defineCommand({
  meta: { name: 'status', description: 'Query perp order status by oid or cloid' },
  args: withOutputArgs({
    ...marketBaseArgs,
    id: {
      type: 'positional',
      description: 'Order id or client order id',
      required: true,
    },
  }),
  async run({ args }) {
    const out = createOutput()
    await runHyperliquidCommand(out, async () => {
      const ctx = requireHyperliquidWalletContext(args, out)
      const result = await getPerpOrderStatus(ctx, {
        id: args.id ? String(args.id) : undefined,
      })
      const response = result.response
      if (response && typeof response === 'object' && 'order' in response && response.order && 'status' in response) {
        out.table(
          [
            {
              coin: response.order.coin,
              status: String(response.status),
              side: resolveOrderSide(response.order.side),
              size: response.order.sz,
              limitPx: response.order.limitPx,
              isTrigger: response.order.isTrigger,
              reduceOnly: response.order.reduceOnly,
              oid: response.order.oid,
              cloid: response.order.cloid ?? 'N/A',
              statusTimestamp:
                'statusTimestamp' in response ? formatTimestamp(Number(response.statusTimestamp)) : 'N/A',
            },
          ],
          {
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
            title: `Perp Order Status | ${result.walletName} (${result.user})`,
          },
        )
        return
      }

      out.data(response)
    })
  },
})
