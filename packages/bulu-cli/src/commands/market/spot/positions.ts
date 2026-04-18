import { defineCommand } from 'citty'
import { fetchSpotClearinghouseState } from '../../../protocols/hyperliquid'
import { createOutput, resolveOutputOptions } from '../../../core/output'
import { resolveSpotQueryArgs, resolveSpotUserContext } from './shared'
import { loadDataOrExit } from '../../../utils/cli'
import { renderResult } from '../../../utils/output'

export default defineCommand({
  meta: { name: 'positions', description: 'Show spot balances' },
  args: resolveSpotQueryArgs({
    legacyWallet: {
      type: 'positional',
      description: 'Deprecated positional wallet name or id',
      required: false,
    },
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

    renderResult(out, args, {
      rows,
      dataKey: 'balances',
      emptyMessage: `No spot balances for ${walletName} (${user})`,
      columns: ['coin', 'total', 'hold', 'entryNtl'],
      title: `Spot Balances | ${walletName} (${user})`,
      walletName,
      user,
    })
  },
})
