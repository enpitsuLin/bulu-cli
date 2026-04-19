import { defineCommand } from 'citty'
import { formatTimestamp } from '#/core/time'
import { createOutput, withOutputArgs } from '#/core/output'
import { resolveOrderSide } from '../../../hyperliquid/domain/orders/resolve'
import { listPerpHistory } from '../../../hyperliquid/features/perps/use-cases/perps'
import { marketBaseArgs } from '../../../hyperliquid/shared/args'
import { requireHyperliquidWalletContext } from '../../../hyperliquid/shared/context'
import { runHyperliquidCommand } from '../../../hyperliquid/shared/errors'

export default defineCommand({
  meta: { name: 'history', description: 'Show historical perp orders' },
  args: withOutputArgs({
    ...marketBaseArgs,
    coin: {
      type: 'string',
      description: 'Filter order history by perp symbol',
    },
    status: {
      type: 'string',
      description: 'Filter order history by order status',
    },
    limit: {
      type: 'string',
      description: 'Maximum number of rows to show',
      default: '50',
    },
  }),
  async run({ args }) {
    const out = createOutput()
    await runHyperliquidCommand(out, async () => {
      const ctx = requireHyperliquidWalletContext(args, out)
      const result = await listPerpHistory(ctx, {
        coin: args.coin ? String(args.coin) : undefined,
        status: args.status ? String(args.status) : undefined,
        limit: args.limit ? String(args.limit) : undefined,
      })
      out.table(
        result.entries.map((entry) => ({
          coin: entry.order.coin,
          status: entry.status,
          side: resolveOrderSide(entry.order.side),
          size: entry.order.sz,
          origSize: entry.order.origSz,
          limitPx: entry.order.limitPx,
          tif: entry.order.tif,
          reduceOnly: entry.order.reduceOnly,
          oid: entry.order.oid,
          cloid: entry.order.cloid ?? 'N/A',
          statusTimestamp: formatTimestamp(entry.statusTimestamp),
        })),
        {
          columns: [
            'coin',
            'status',
            'side',
            'size',
            'origSize',
            'limitPx',
            'tif',
            'reduceOnly',
            'oid',
            'cloid',
            'statusTimestamp',
          ],
          title: `Perp Order History | ${result.walletName} (${result.user})`,
        },
      )
    })
  },
})
