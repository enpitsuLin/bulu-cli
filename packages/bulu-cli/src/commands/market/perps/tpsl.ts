import { defineCommand } from 'citty'
import { createOutput, withOutputArgs } from '#/core/output'
import { placePerpTpsl } from '../../../hyperliquid/features/perps/use-cases/perps'
import { marketBaseArgs } from '../../../hyperliquid/shared/args'
import { requireHyperliquidWalletContext } from '../../../hyperliquid/shared/context'
import { runHyperliquidCommand } from '../../../hyperliquid/shared/errors'

export default defineCommand({
  meta: { name: 'tpsl', description: 'Place take-profit and stop-loss orders for perp positions' },
  subCommands: {
    'stop-loss': defineCommand({
      meta: { name: 'stop-loss', description: 'Place a reduce-only stop loss for an open perp position' },
      args: withOutputArgs({
        ...marketBaseArgs,
        coin: {
          type: 'positional',
          description: 'Trading pair symbol, e.g. BTC, ETH',
          required: true,
        },
        trigger: {
          type: 'string',
          description: 'Trigger price used to arm the order',
          required: true,
        },
        size: {
          type: 'string',
          description: 'Order size in base asset units (omit to cover the full position)',
        },
        price: {
          type: 'string',
          description: 'Optional limit price after trigger (omit for market TP/SL)',
        },
      }),
      async run({ args }) {
        const out = createOutput()
        await runHyperliquidCommand(out, async () => {
          const ctx = requireHyperliquidWalletContext(args, out)
          const result = await placePerpTpsl(ctx, {
            coin: args.coin ? String(args.coin) : undefined,
            trigger: args.trigger ? String(args.trigger) : undefined,
            size: args.size ? String(args.size) : undefined,
            price: args.price ? String(args.price) : undefined,
            tpsl: 'sl',
          })
          const detail = `${result.coin} ${String(result.order.triggerKind).toUpperCase()} ${result.order.size} trigger ${result.order.triggerPx} -> ${result.order.price}`

          out.table(result.statuses, {
            columns: ['orderIndex', 'result'],
            title: `Perp Order | ${result.walletName} | ${detail}`,
          })
        })
      },
    }),
    'take-profit': defineCommand({
      meta: { name: 'take-profit', description: 'Place a reduce-only take profit for an open perp position' },
      args: withOutputArgs({
        ...marketBaseArgs,
        coin: {
          type: 'positional',
          description: 'Trading pair symbol, e.g. BTC, ETH',
          required: true,
        },
        trigger: {
          type: 'string',
          description: 'Trigger price used to arm the order',
          required: true,
        },
        size: {
          type: 'string',
          description: 'Order size in base asset units (omit to cover the full position)',
        },
        price: {
          type: 'string',
          description: 'Optional limit price after trigger (omit for market TP/SL)',
        },
      }),
      async run({ args }) {
        const out = createOutput()
        await runHyperliquidCommand(out, async () => {
          const ctx = requireHyperliquidWalletContext(args, out)
          const result = await placePerpTpsl(ctx, {
            coin: args.coin ? String(args.coin) : undefined,
            trigger: args.trigger ? String(args.trigger) : undefined,
            size: args.size ? String(args.size) : undefined,
            price: args.price ? String(args.price) : undefined,
            tpsl: 'tp',
          })
          const detail = `${result.coin} ${String(result.order.triggerKind).toUpperCase()} ${result.order.size} trigger ${result.order.triggerPx} -> ${result.order.price}`

          out.table(result.statuses, {
            columns: ['orderIndex', 'result'],
            title: `Perp Order | ${result.walletName} | ${detail}`,
          })
        })
      },
    }),
  },
})
