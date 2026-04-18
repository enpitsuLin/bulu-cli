import { defineCommand } from 'citty'
import { buildUpdateLeverageAction } from '../../../protocols/hyperliquid'
import { createOutput, resolveOutputOptions } from '../../../core/output'
import {
  handleCommandError,
  loadPerpMarketOrExit,
  resolvePerpQueryArgs,
  resolvePerpUserContext,
  submitExchangeAction,
} from './shared'
import { executeOrExit } from '../../../utils/cli'

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
    const out = createOutput(resolveOutputOptions(args))
    const { walletName, user } = resolvePerpUserContext(args, out)
    const coin = String(args.coin).toUpperCase()
    const market = await loadPerpMarketOrExit(coin, args.testnet, out)

    const leverage = executeOrExit(out, () => parseLeverage(String(args.value)), 'Invalid leverage')

    const _response = await submitExchangeAction({
      action: buildUpdateLeverageAction({
        asset: market.assetIndex,
        leverage,
        isCross: !args.isolated,
      }),
      walletName,
      testnet: args.testnet,
    }).catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      handleCommandError(out, `Failed to update leverage: ${message}`)
    })

    const row = {
      coin,
      leverage,
      mode: args.isolated ? 'isolated' : 'cross',
    }

    out.table([row], {
      columns: ['coin', 'leverage', 'mode'],
      title: `Updated Perp Leverage | ${walletName} (${user})`,
    })
  },
})
