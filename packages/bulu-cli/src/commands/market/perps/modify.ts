import { defineCommand } from 'citty'
import {
  buildModifyAction,
  buildOrderWire,
  fetchFrontendOpenOrders,
  fetchMarketAsset,
  fetchSpotMeta,
  partitionEntriesBySpot,
  resolveOrderSide,
  resolveOrderTimeInForce,
  resolveTriggerKindFromOrder,
} from '../../../protocols/hyperliquid'
import type { FrontendOpenOrder, HyperliquidMarketAsset } from '../../../protocols/hyperliquid'
import { createOutput, resolveOutputOptions } from '../../../core/output'
import { resolvePerpQueryArgs, resolvePerpUserContext } from './shared'
import { loadDataOrExit, renderSingleResult } from '../command-helpers'
import { submitExchangeAction } from './shared'
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
    const out = createOutput(resolveOutputOptions(args))
    const { walletName, user } = resolvePerpUserContext(args, out)
    if (!args.price && !args.size && !args.trigger && !args.tp && !args.sl) {
      out.warn('Provide at least one of --price, --size, --trigger, --tp, or --sl')
      process.exit(1)
    }

    const [orders, spotMeta] = await loadDataOrExit(
      out,
      Promise.all([fetchFrontendOpenOrders(user, args.testnet), fetchSpotMeta(args.testnet)]),
      'Failed to fetch open orders',
    )

    const { perps, spot } = partitionEntriesBySpot(orders, spotMeta)
    const currentOrder = findOrderByIdentifier(perps, String(args.id))
    if (!currentOrder) {
      const spotOrder = findOrderByIdentifier(spot, String(args.id))
      if (spotOrder) {
        out.warn(`Order ${args.id} belongs to spot; use \`bulu market spot cancel\` and place a new spot order`)
        process.exit(1)
      }
      out.warn(`Order not found: ${args.id}`)
      process.exit(1)
    }

    const market: HyperliquidMarketAsset = await loadDataOrExit(
      out,
      fetchMarketAsset(currentOrder.coin, args.testnet),
      'Failed to load market',
    )

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

    const response = await loadDataOrExit(
      out,
      submitExchangeAction({
        action: buildModifyAction({
          oid: currentOrder.cloid ?? currentOrder.oid,
          order: wire,
        }),
        walletName,
        testnet: args.testnet,
      }),
      'Failed to modify order',
    )

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

    renderSingleResult(out, args, {
      row,
      columns: ['coin', 'side', 'size', 'limitPx', 'triggerPx', 'reduceOnly', 'oid', 'cloid'],
      title: `Modified Perp Order | ${walletName} (${user})`,
      jsonData: { wallet: walletName, user, modified: row, response },
    })
  },
})
