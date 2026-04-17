import { defineCommand } from 'citty'
import { createOutput, resolveOutputOptions } from '../../../core/output'
import { withDefaultArgs } from '../../../core/args-def'
import { fetchSpotClearinghouseState } from '../../../protocols/hyperliquid'
import { requireChainAccount, resolveWallet } from '../../../core/wallet'

export default defineCommand({
  meta: { name: 'positions', description: 'Show spot balances' },
  args: withDefaultArgs({
    wallet: {
      type: 'positional',
      description: 'Wallet name or id (defaults to active wallet)',
      required: false,
    },
  }),
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args))
    const { walletName, wallet } = resolveWallet(args.wallet, out)
    const ethAccount = requireChainAccount(wallet, 'eip155:1', out)
    const user = ethAccount.address.toLowerCase()

    let state
    try {
      state = await fetchSpotClearinghouseState(user)
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
