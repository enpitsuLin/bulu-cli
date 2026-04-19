import { defineCommand } from 'citty'
import { resolvePerpTpslOrder } from '../../../protocols/hyperliquid'
import type { ResolvedPerpOrder } from '../../../protocols/hyperliquid'
import { withDefaultArgs } from '../../../core/args-def'
import { createOutput, resolveOutputOptions } from '../../../core/output'
import { marketBaseArgs } from '../shared'
import { handleCommandError, loadPerpMarketOrExit, loadPerpStateOrExit, resolvePerpUserContext } from './shared'
import { submitOrder } from '../order-shared'

async function runTpslCommand(args: Record<string, unknown>, tpsl: 'sl' | 'tp', titlePrefix: string): Promise<void> {
  const out = createOutput(resolveOutputOptions(args))
  const { walletName, user } = resolvePerpUserContext(args, out)
  const coin = String(args.coin).toUpperCase()
  const market = await loadPerpMarketOrExit(coin, args.testnet as boolean | undefined, out)
  const state = await loadPerpStateOrExit(user, args.testnet as boolean | undefined, out)

  const order: ResolvedPerpOrder = (() => {
    try {
      return resolvePerpTpslOrder({
        coin,
        market,
        triggerPrice: String(args.trigger),
        price: args.price ? String(args.price) : undefined,
        size: args.size ? String(args.size) : undefined,
        state,
        tpsl,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return handleCommandError(out, message)
    }
  })()

  const detail = `${coin} ${String(order.triggerKind).toUpperCase()} ${order.size} trigger ${order.triggerPx} -> ${order.price}`

  const statuses = await submitOrder({ walletName, testnet: args.testnet as boolean | undefined }, order.action)

  out.table(statuses, {
    columns: ['orderIndex', 'result'],
    title: `${titlePrefix} | ${walletName} | ${detail}`,
  })
}

export default defineCommand({
  meta: { name: 'tpsl', description: 'Place take-profit and stop-loss orders for perp positions' },
  subCommands: {
    'stop-loss': defineCommand({
      meta: { name: 'stop-loss', description: 'Place a reduce-only stop loss for an open perp position' },
      args: withDefaultArgs({
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
        await runTpslCommand(args, 'sl', 'Perp Stop Loss')
      },
    }),
    'take-profit': defineCommand({
      meta: { name: 'take-profit', description: 'Place a reduce-only take profit for an open perp position' },
      args: withDefaultArgs({
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
        await runTpslCommand(args, 'tp', 'Perp Take Profit')
      },
    }),
  },
})
