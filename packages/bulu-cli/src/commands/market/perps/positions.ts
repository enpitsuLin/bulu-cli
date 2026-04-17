import { defineCommand } from 'citty'
import { fetchClearinghouseState } from '../../../protocols/hyperliquid'
import type { PerpPosition } from '../../../protocols/hyperliquid'
import { resolvePerpOutput, resolvePerpQueryArgs, resolvePerpUserContext } from './shared'

function formatLeverage(leverage: PerpPosition['leverage']): string {
  if (typeof leverage === 'object' && leverage !== null) {
    const label = leverage.type === 'cross' ? 'cross' : 'iso'
    return `${leverage.value}x (${label})`
  }
  return String(leverage)
}

export default defineCommand({
  meta: { name: 'positions', description: 'Show perp positions' },
  args: resolvePerpQueryArgs(),
  async run({ args }) {
    const out = resolvePerpOutput(args)
    const { walletName, user } = resolvePerpUserContext(args, out)

    let state
    try {
      state = await fetchClearinghouseState(user, args.testnet)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      out.warn(`Failed to fetch positions: ${message}`)
      process.exit(1)
    }

    const rows = (state.assetPositions || []).map((ap) => ({
      coin: ap.position.coin,
      size: ap.position.szi,
      entryPx: ap.position.entryPx ?? 'N/A',
      positionValue: ap.position.positionValue,
      unrealizedPnl: ap.position.unrealizedPnl,
      leverage: formatLeverage(ap.position.leverage),
      liquidationPx: ap.position.liquidationPx ?? 'N/A',
    }))

    const isJson = args.json || args.format === 'json'
    const isCsv = args.format === 'csv'

    if (rows.length === 0) {
      if (isJson) {
        out.data({ wallet: walletName, user, positions: [] })
      } else {
        out.success(`No open perp positions for ${walletName} (${user})`)
      }
      return
    }

    if (isJson) {
      out.data({ wallet: walletName, user, positions: rows })
      return
    }

    if (isCsv) {
      const header = 'coin,size,entryPx,positionValue,unrealizedPnl,leverage,liquidationPx'
      out.data(header)
      for (const row of rows) {
        const line = `${row.coin},${row.size},${row.entryPx},${row.positionValue},${row.unrealizedPnl},${row.leverage},${row.liquidationPx}`
        out.data(line)
      }
      return
    }

    out.table(rows, {
      columns: ['coin', 'size', 'entryPx', 'positionValue', 'unrealizedPnl', 'leverage', 'liquidationPx'],
      title: `Perp Positions | ${walletName} (${user})`,
    })
  },
})
