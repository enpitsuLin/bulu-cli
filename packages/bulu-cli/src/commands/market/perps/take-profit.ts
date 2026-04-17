import { defineCommand } from 'citty'
import { resolvePerpTpslOrder } from '../../../protocols/hyperliquid'
import type { OrderResponse, ResolvedPerpOrder } from '../../../protocols/hyperliquid'
import {
  handleCommandError,
  loadPerpMarketOrExit,
  loadPerpStateOrExit,
  renderOrderSubmission,
  resolvePerpOutput,
  resolvePerpQueryArgs,
  resolvePerpUserContext,
  submitExchangeAction,
} from './shared'

export default defineCommand({
  meta: { name: 'take-profit', description: 'Place a reduce-only take profit for an open perp position' },
  args: resolvePerpQueryArgs({
    coin: {
      type: 'positional',
      description: 'Trading pair symbol, e.g. BTC, ETH',
      required: true,
    },
    trigger: {
      type: 'string',
      description: 'Trigger price used to arm the take profit',
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
    const out = resolvePerpOutput(args)
    const { walletName, user } = resolvePerpUserContext(args, out)
    const coin = String(args.coin).toUpperCase()
    const market = await loadPerpMarketOrExit(coin, args.testnet, out)
    const state = await loadPerpStateOrExit(user, args.testnet, out)

    const order: ResolvedPerpOrder = (() => {
      try {
        return resolvePerpTpslOrder({
          coin,
          market,
          triggerPrice: String(args.trigger),
          price: args.price ? String(args.price) : undefined,
          size: args.size ? String(args.size) : undefined,
          state,
          tpsl: 'tp',
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return handleCommandError(out, message)
      }
    })()

    try {
      const response = await submitExchangeAction<OrderResponse>({
        action: order.action,
        walletName,
        testnet: args.testnet,
      })
      renderOrderSubmission({
        out,
        commandArgs: args,
        walletName,
        user,
        coin,
        order,
        response,
        titlePrefix: 'Perp Take Profit',
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      handleCommandError(out, `Failed to submit take profit: ${message}`)
    }
  },
})
