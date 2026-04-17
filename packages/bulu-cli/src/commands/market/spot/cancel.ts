import { defineCommand } from 'citty'
import {
  buildCancelAction,
  fetchFrontendOpenOrders,
  findSpotMarketAsset,
  normalizeSpotPair,
  partitionEntriesBySpot,
} from '../../../protocols/hyperliquid'
import { findOrderByIdentifier } from '../utils'
import { loadSpotMarketStateOrExit, resolveSpotOutput, resolveSpotQueryArgs, resolveSpotUserContext } from './shared'
import { mapSpotOpenOrders } from './utils'
import { submitExchangeAction } from '../shared'

export default defineCommand({
  meta: { name: 'cancel', description: 'Cancel open spot orders' },
  args: resolveSpotQueryArgs({
    id: {
      type: 'positional',
      description: 'Order id or client order id',
      required: false,
    },
    pair: {
      type: 'string',
      description: 'Restrict cancellation to a specific spot pair',
    },
    all: {
      type: 'boolean',
      description: 'Cancel all open spot orders, optionally filtered by --pair',
      default: false,
    },
  }),
  async run({ args }) {
    const out = resolveSpotOutput(args)
    const { walletName, user } = resolveSpotUserContext(args, out)
    const pairFilter = args.pair ? normalizeSpotPair(String(args.pair)) : undefined

    if (!args.all && !args.id) {
      out.warn('Provide an order id or use --all')
      process.exit(1)
    }

    const spotMarket = await loadSpotMarketStateOrExit(args.testnet, out)

    let orders
    try {
      orders = await fetchFrontendOpenOrders(user, args.testnet)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      out.warn(`Failed to fetch open orders: ${message}`)
      process.exit(1)
    }

    const { spot } = partitionEntriesBySpot(orders, spotMarket.meta)
    const candidates = pairFilter ? spot.filter((order) => order.coin === pairFilter) : spot
    const selected = args.all
      ? candidates
      : (() => {
          const match = findOrderByIdentifier(candidates, String(args.id))
          return match ? [match] : []
        })()

    if (selected.length === 0) {
      out.warn(args.all ? 'No matching open spot orders to cancel' : `Spot order not found: ${args.id}`)
      process.exit(1)
    }

    const action = buildCancelAction(
      selected.map((order) => ({
        a: findSpotMarketAsset(order.coin, spotMarket).assetIndex,
        o: order.oid,
      })),
    )

    try {
      const response = await submitExchangeAction({
        action,
        walletName,
        testnet: args.testnet,
      })

      const rows = mapSpotOpenOrders(selected)

      if (args.json || args.format === 'json') {
        out.data({
          wallet: walletName,
          user,
          canceled: rows,
          response,
        })
        return
      }

      if (args.format === 'csv') {
        out.data('pair,side,size,origSize,limitPx,tif,triggerPx,reduceOnly,oid,cloid,timestamp')
        for (const row of rows) {
          out.data(
            `${row.pair},${row.side},${row.size},${row.origSize},${row.limitPx},${row.tif},${row.triggerPx},${row.reduceOnly},${row.oid},${row.cloid},${row.timestamp}`,
          )
        }
        return
      }

      out.table(rows, {
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
        title: `Canceled Spot Orders | ${walletName} (${user})`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      out.warn(`Failed to cancel order: ${message}`)
      process.exit(1)
    }
  },
})
