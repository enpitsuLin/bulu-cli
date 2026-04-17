import { defineCommand } from 'citty'
import { fetchSpotClearinghouseState } from '../../../protocols/hyperliquid'
import { resolveSpotOutput, resolveSpotQueryArgs, resolveSpotUserContext } from './shared'

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
    const out = resolveSpotOutput(args)
    const { walletName, user } = resolveSpotUserContext(args, out)

    let state
    try {
      state = await fetchSpotClearinghouseState(user, args.testnet)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      out.warn(`Failed to fetch spot balances: ${message}`)
      process.exit(1)
    }

    const rows = (state.balances || []).map((b) => ({
      coin: b.coin,
      total: b.total,
      hold: b.hold,
      entryNtl: b.entryNtl,
    }))

    const isJson = args.json || args.format === 'json'
    const isCsv = args.format === 'csv'

    if (rows.length === 0) {
      if (isJson) {
        out.data({ wallet: walletName, user, balances: [] })
      } else {
        out.success(`No spot balances for ${walletName} (${user})`)
      }
      return
    }

    if (isJson) {
      out.data({ wallet: walletName, user, balances: rows })
      return
    }

    if (isCsv) {
      const header = 'coin,total,hold,entryNtl'
      out.data(header)
      for (const row of rows) {
        const line = `${row.coin},${row.total},${row.hold},${row.entryNtl}`
        out.data(line)
      }
      return
    }

    out.table(rows, {
      columns: ['coin', 'total', 'hold', 'entryNtl'],
      title: `Spot Balances | ${walletName} (${user})`,
    })
  },
})
