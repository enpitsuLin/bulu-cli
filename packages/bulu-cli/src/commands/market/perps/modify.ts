import { defineCommand } from 'citty'
import {
  buildModifyAction,
  buildOrderWire,
  fetchFrontendOpenOrders,
  fetchMarketAsset,
  resolveOrderSide,
  resolveOrderTimeInForce,
  resolveTriggerKindFromOrder,
} from '../../../protocols/hyperliquid'
import type { FrontendOpenOrder } from '../../../protocols/hyperliquid'
import {
  handleCommandError,
  resolvePerpOutput,
  resolvePerpQueryArgs,
  resolvePerpUserContext,
  submitExchangeAction,
} from './shared'
import { findOrderByIdentifier } from './utils'

function isMarketTrigger(order: FrontendOpenOrder): boolean {
  return order.orderType.toLowerCase().includes('market')
}

export default defineCommand({
  meta: { name: 'modify', description: 'Modify an open perp order by oid or cloid' },
  args: resolvePerpQueryArgs({
    id: {
      type: 'positional',
      description: 'Order id or client order id',
      required: true,
    },
    price: {
      type: 'string',
      description: 'New limit price or triggered execution price',
    },
    size: {
      type: 'string',
      description: 'New order size in base asset units',
    },
    trigger: {
      type: 'string',
      description: 'New trigger price for TP/SL orders',
    },
    tp: {
      type: 'boolean',
      description: 'Treat the modified trigger order as take profit',
      default: false,
    },
    sl: {
      type: 'boolean',
      description: 'Treat the modified trigger order as stop loss',
      default: false,
    },
  }),
  async run({ args }) {
    const out = resolvePerpOutput(args)
    const { walletName, user } = resolvePerpUserContext(args, out)
    if (!args.price && !args.size && !args.trigger && !args.tp && !args.sl) {
      out.warn('Provide at least one of --price, --size, --trigger, --tp, or --sl')
      process.exit(1)
    }

    let orders
    try {
      orders = await fetchFrontendOpenOrders(user, args.testnet)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      handleCommandError(out, `Failed to fetch open orders: ${message}`)
    }

    const currentOrder = findOrderByIdentifier(orders, String(args.id))
    if (!currentOrder) {
      out.warn(`Order not found: ${args.id}`)
      process.exit(1)
    }

    let market
    try {
      market = await fetchMarketAsset(currentOrder.coin, args.testnet)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      handleCommandError(out, message)
    }

    const triggerKind = currentOrder.isTrigger
      ? resolveTriggerKindFromOrder(currentOrder, args.tp ? 'tp' : args.sl ? 'sl' : undefined)
      : undefined

    const wire = buildOrderWire({
      assetIndex: market.assetIndex,
      isBuy: currentOrder.side === 'B',
      size: args.size ? String(args.size) : currentOrder.sz,
      price: args.price
        ? String(args.price)
        : currentOrder.isTrigger && isMarketTrigger(currentOrder)
          ? (currentOrder.triggerPx ?? currentOrder.limitPx)
          : currentOrder.limitPx,
      reduceOnly: currentOrder.reduceOnly,
      tif: currentOrder.isTrigger ? undefined : resolveOrderTimeInForce(currentOrder),
      trigger: currentOrder.isTrigger
        ? {
            isMarket: args.price ? false : isMarketTrigger(currentOrder),
            triggerPx: args.trigger ? String(args.trigger) : (currentOrder.triggerPx ?? currentOrder.limitPx),
            tpsl: triggerKind!,
          }
        : undefined,
      cloid: currentOrder.cloid ?? undefined,
    })

    try {
      const response = await submitExchangeAction({
        action: buildModifyAction({
          oid: currentOrder.cloid ?? currentOrder.oid,
          order: wire,
        }),
        walletName,
        testnet: args.testnet,
      })

      const row = {
        coin: currentOrder.coin,
        side: resolveOrderSide(currentOrder.side),
        size: wire.s,
        limitPx: wire.p,
        triggerPx: 'trigger' in wire.t ? wire.t.trigger.triggerPx : 'N/A',
        reduceOnly: wire.r,
        oid: currentOrder.oid,
        cloid: currentOrder.cloid ?? 'N/A',
      }

      if (args.json || args.format === 'json') {
        out.data({
          wallet: walletName,
          user,
          modified: row,
          response,
        })
        return
      }

      if (args.format === 'csv') {
        out.data('coin,side,size,limitPx,triggerPx,reduceOnly,oid,cloid')
        out.data(
          `${row.coin},${row.side},${row.size},${row.limitPx},${row.triggerPx},${row.reduceOnly},${row.oid},${row.cloid}`,
        )
        return
      }

      out.table([row], {
        columns: ['coin', 'side', 'size', 'limitPx', 'triggerPx', 'reduceOnly', 'oid', 'cloid'],
        title: `Modified Perp Order | ${walletName} (${user})`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      handleCommandError(out, `Failed to modify order: ${message}`)
    }
  },
})
