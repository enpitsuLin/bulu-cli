import { defineCommand } from 'citty'
import { buildUpdateIsolatedMarginAction } from '../../../protocols/hyperliquid'
import {
  handleCommandError,
  loadPerpMarketOrExit,
  resolvePerpOutput,
  resolvePerpQueryArgs,
  resolvePerpUserContext,
  submitExchangeAction,
} from './shared'

function parseScaledUsdDelta(value: string): number {
  const trimmed = value.trim()
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid margin delta: ${value}`)
  }

  const sign = trimmed.startsWith('-') ? -1 : 1
  const unsigned = sign === -1 ? trimmed.slice(1) : trimmed
  const [whole, frac = ''] = unsigned.split('.')
  const paddedFrac = (frac + '000000').slice(0, 6)
  const scaled = Number(whole) * 1_000_000 + Number(paddedFrac)

  if (!Number.isSafeInteger(scaled) || scaled === 0) {
    throw new Error(`Invalid margin delta: ${value}`)
  }

  return sign * scaled
}

export default defineCommand({
  meta: { name: 'margin', description: 'Add or remove isolated margin for a perp position' },
  args: resolvePerpQueryArgs({
    coin: {
      type: 'positional',
      description: 'Trading pair symbol, e.g. BTC, ETH',
      required: true,
    },
    delta: {
      type: 'positional',
      description: 'USDC delta to apply, e.g. 10 or -5.25',
      required: true,
    },
  }),
  async run({ args }) {
    const out = resolvePerpOutput(args)
    const { walletName, user } = resolvePerpUserContext(args, out)
    const coin = String(args.coin).toUpperCase()
    const market = await loadPerpMarketOrExit(coin, args.testnet, out)

    const ntli = (() => {
      try {
        return parseScaledUsdDelta(String(args.delta))
      } catch (error) {
        return handleCommandError(out, error instanceof Error ? error.message : String(error))
      }
    })()

    try {
      const response = await submitExchangeAction({
        action: buildUpdateIsolatedMarginAction({
          asset: market.assetIndex,
          ntli,
        }),
        walletName,
        testnet: args.testnet,
      })

      const row = {
        coin,
        delta: String(args.delta),
        ntli,
      }

      if (args.json || args.format === 'json') {
        out.data({ wallet: walletName, user, update: row, response })
        return
      }

      if (args.format === 'csv') {
        out.data('coin,delta,ntli')
        out.data(`${row.coin},${row.delta},${row.ntli}`)
        return
      }

      out.table([row], {
        columns: ['coin', 'delta', 'ntli'],
        title: `Updated Isolated Margin | ${walletName} (${user})`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      handleCommandError(out, `Failed to update isolated margin: ${message}`)
    }
  },
})
