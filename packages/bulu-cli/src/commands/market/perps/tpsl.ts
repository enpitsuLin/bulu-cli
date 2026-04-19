import { defineCommand } from 'citty'
import { withOutputArgs } from '../../../core/output'
import { createOutput } from '../../../core/output'
import { presentPerpOrderResult } from '../../../hyperliquid/features/perps/presenters/perps'
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
          out.data(presentPerpOrderResult(result))
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
          out.data(presentPerpOrderResult(result))
        })
      },
    }),
  },
})
