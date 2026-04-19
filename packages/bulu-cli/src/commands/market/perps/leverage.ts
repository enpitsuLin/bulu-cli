import { defineCommand } from 'citty'
import { withDefaultArgs } from '../../../core/args-def'
import { createOutput, resolveOutputOptions } from '../../../core/output'
import { presentUpdatedPerpLeverage } from '../../../hyperliquid/features/perps/presenters/perps'
import { updatePerpLeverage } from '../../../hyperliquid/features/perps/use-cases/perps'
import { marketBaseArgs } from '../../../hyperliquid/shared/args'
import { requireHyperliquidWalletContext } from '../../../hyperliquid/shared/context'
import { runHyperliquidCommand } from '../../../hyperliquid/shared/errors'
import { renderView } from '../../../hyperliquid/shared/view'

export default defineCommand({
  meta: { name: 'leverage', description: 'Update perp leverage and margin mode for a coin' },
  args: withDefaultArgs({
    ...marketBaseArgs,
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
    await runHyperliquidCommand(out, async () => {
      const ctx = requireHyperliquidWalletContext(args, out)
      const result = await updatePerpLeverage(ctx, {
        coin: args.coin ? String(args.coin) : undefined,
        value: args.value ? String(args.value) : undefined,
        isolated: args.isolated === true,
      })
      renderView(out, presentUpdatedPerpLeverage(result))
    })
  },
})
