import { defineCommand } from 'citty'
import { marketBaseArgs } from '../../../core/hyperliquid/command'
import { resolvePerpUserContext } from '../../../core/hyperliquid/perps'
import { fetchClearinghouseState } from '../../../protocols/hyperliquid'
import type { PerpPosition } from '../../../protocols/hyperliquid'
import { withDefaultArgs } from '../../../core/args-def'
import { createOutput, resolveOutputOptions } from '../../../core/output'
import { loadDataOrExit } from '../../../utils/cli'

function formatLeverage(leverage: PerpPosition['leverage']): string {
  if (typeof leverage === 'object' && leverage !== null) {
    const label = leverage.type === 'cross' ? 'cross' : 'iso'
    return `${leverage.value}x (${label})`
  }
  return String(leverage)
}

export default defineCommand({
  meta: { name: 'positions', description: 'Show perp positions' },
  args: withDefaultArgs({
    ...marketBaseArgs,
  }),
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args))
    const { walletName, user } = resolvePerpUserContext(args, out)

    const state = await loadDataOrExit(out, fetchClearinghouseState(user, args.testnet), 'Failed to fetch positions')

    const rows = (state.assetPositions || []).map((ap) => ({
      coin: ap.position.coin,
      size: ap.position.szi,
      entryPx: ap.position.entryPx ?? 'N/A',
      positionValue: ap.position.positionValue,
      unrealizedPnl: ap.position.unrealizedPnl,
      leverage: formatLeverage(ap.position.leverage),
      liquidationPx: ap.position.liquidationPx ?? 'N/A',
    }))

    out.table(rows, {
      columns: ['coin', 'size', 'entryPx', 'positionValue', 'unrealizedPnl', 'leverage', 'liquidationPx'],
      title: `Perp Positions | ${walletName} (${user})`,
    })
  },
})
