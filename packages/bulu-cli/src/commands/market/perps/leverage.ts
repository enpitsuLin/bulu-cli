import { defineCommand } from 'citty'
import { buildUpdateLeverageAction } from '../../../protocols/hyperliquid'
import {
  handleCommandError,
  loadPerpMarketOrExit,
  resolvePerpOutput,
  resolvePerpQueryArgs,
  resolvePerpUserContext,
  submitExchangeAction,
} from './shared'

function parseLeverage(value: string): number {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid leverage: ${value}`)
  }
  return parsed
}

export default defineCommand({
  meta: { name: 'leverage', description: 'Update perp leverage and margin mode for a coin' },
  args: resolvePerpQueryArgs({
    coin: {
      type: 'positional',
      description: 'Trading pair symbol, e.g. BTC, ETH',
      required: true,
    },
    value: {
      type: 'positional',
      description: 'New leverage value as a positive integer',
      required: true,
    },
    isolated: {
      type: 'boolean',
      description: 'Use isolated leverage instead of cross',
      default: false,
    },
  }),
  async run({ args }) {
    const out = resolvePerpOutput(args)
    const { walletName, user } = resolvePerpUserContext(args, out)
    const coin = String(args.coin).toUpperCase()
    const market = await loadPerpMarketOrExit(coin, args.testnet, out)

    let leverage: number
    try {
      leverage = parseLeverage(String(args.value))
    } catch (error) {
      handleCommandError(out, error instanceof Error ? error.message : String(error))
    }

    try {
      const response = await submitExchangeAction({
        action: buildUpdateLeverageAction({
          asset: market.assetIndex,
          leverage,
          isCross: !args.isolated,
        }),
        walletName,
        testnet: args.testnet,
      })

      const row = {
        coin,
        leverage,
        mode: args.isolated ? 'isolated' : 'cross',
      }

      if (args.json || args.format === 'json') {
        out.data({ wallet: walletName, user, update: row, response })
        return
      }

      if (args.format === 'csv') {
        out.data('coin,leverage,mode')
        out.data(`${row.coin},${row.leverage},${row.mode}`)
        return
      }

      out.table([row], {
        columns: ['coin', 'leverage', 'mode'],
        title: `Updated Perp Leverage | ${walletName} (${user})`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      handleCommandError(out, `Failed to update leverage: ${message}`)
    }
  },
})
