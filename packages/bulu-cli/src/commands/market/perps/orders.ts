import { defineCommand } from 'citty'
import { createOutput, resolveOutputOptions } from '../../../core/output'
import { withDefaultArgs } from '../../../core/args-def'
import { fetchOpenOrders } from '../../../protocols/hyperliquid'
import { requireChainAccount, resolveWallet } from '../../../core/wallet'
import { formatTimestamp } from '../../../core/time'
import type { OpenOrder } from '../../../protocols/hyperliquid'

function formatSide(side: 'A' | 'B'): string {
  return side === 'B' ? 'long' : 'short'
}

function formatTif(tif: string, isTrigger: boolean): string {
  if (isTrigger) return `trigger (${tif})`
  return tif
}

function mapOpenOrder(order: OpenOrder) {
  return {
    coin: order.coin,
    side: formatSide(order.side),
    size: order.sz,
    origSize: order.origSz,
    limitPx: order.limitPx,
    tif: formatTif(order.tif, order.isTrigger),
    reduceOnly: order.reduceOnly,
    oid: order.oid,
    timestamp: order.timestamp,
  }
}

export function formatOpenOrderRows(orders: OpenOrder[]) {
  return orders.map((order) => ({
    ...mapOpenOrder(order),
    timestamp: formatTimestamp(order.timestamp),
  }))
}

export default defineCommand({
  meta: { name: 'orders', description: 'Show open perp orders' },
  args: withDefaultArgs({
    wallet: {
      type: 'positional',
      description: 'Wallet name or id (defaults to active wallet)',
      required: false,
    },
    testnet: {
      type: 'boolean',
      description: 'Use Hyperliquid testnet',
      default: false,
    },
  }),
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args))
    const { walletName, wallet } = resolveWallet(args.wallet, out)
    const ethAccount = requireChainAccount(wallet, 'eip155:1', out)
    const user = ethAccount.address.toLowerCase()

    let orders: OpenOrder[] = []
    try {
      orders = await fetchOpenOrders(user, args.testnet)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      out.warn(`Failed to fetch open orders: ${message}`)
      process.exit(1)
    }

    const rawRows = (orders || []).map(mapOpenOrder)
    const displayRows = formatOpenOrderRows(orders || [])

    const isJson = args.json || args.format === 'json'
    const isCsv = args.format === 'csv'

    if (rawRows.length === 0) {
      if (isJson) {
        out.data({ wallet: walletName, user, orders: [] })
      } else {
        out.success(`No open perp orders for ${walletName} (${user})`)
      }
      return
    }

    if (isJson) {
      out.data({ wallet: walletName, user, orders: rawRows })
      return
    }

    if (isCsv) {
      const header = 'coin,side,size,origSize,limitPx,tif,reduceOnly,oid,timestamp'
      out.data(header)
      for (const row of displayRows) {
        const line = `${row.coin},${row.side},${row.size},${row.origSize},${row.limitPx},${row.tif},${row.reduceOnly},${row.oid},${row.timestamp}`
        out.data(line)
      }
      return
    }

    out.table(displayRows, {
      columns: ['coin', 'side', 'size', 'origSize', 'limitPx', 'tif', 'reduceOnly', 'oid', 'timestamp'],
      title: `Open Perp Orders | ${walletName} (${user})`,
    })
  },
})
