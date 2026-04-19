import { defineCommand } from 'citty'
import { marketBaseArgs } from '../../../core/hyperliquid/command'
import { resolveSpotUserContext } from '../../../core/hyperliquid/spot'
import { fetchSpotClearinghouseState } from '../../../protocols/hyperliquid'
import { withDefaultArgs } from '../../../core/args-def'
import { createOutput, resolveOutputOptions } from '../../../core/output'
import { loadDataOrExit } from '../../../utils/cli'

export default defineCommand({
  meta: { name: 'positions', description: 'Show spot balances' },
  args: withDefaultArgs({
    ...marketBaseArgs,
  }),
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args))
    const { walletName, user } = resolveSpotUserContext(args, out)

    const state = await loadDataOrExit(
      out,
      fetchSpotClearinghouseState(user, args.testnet),
      'Failed to fetch spot balances',
    )

    const rows = (state.balances || []).map((b) => ({
      coin: b.coin,
      total: b.total,
      hold: b.hold,
      entryNtl: b.entryNtl,
    }))

    out.table(rows, {
      columns: ['coin', 'total', 'hold', 'entryNtl'],
      title: `Spot Balances | ${walletName} (${user})`,
    })
  },
})
