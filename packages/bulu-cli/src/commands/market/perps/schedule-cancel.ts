import { defineCommand } from 'citty'
import { withDefaultArgs } from '../../../core/args-def'
import { createOutput, resolveOutputOptions } from '../../../core/output'
import { presentScheduledCancel } from '../../../hyperliquid/features/perps/presenters/perps'
import { updatePerpScheduleCancel } from '../../../hyperliquid/features/perps/use-cases/perps'
import { marketBaseArgs } from '../../../hyperliquid/shared/args'
import { requireHyperliquidWalletContext } from '../../../hyperliquid/shared/context'
import { runHyperliquidCommand } from '../../../hyperliquid/shared/errors'
import { renderView } from '../../../hyperliquid/shared/view'

export default defineCommand({
  meta: { name: 'schedule-cancel', description: "Manage Hyperliquid's scheduled cancel-all deadline" },
  args: withDefaultArgs({
    ...marketBaseArgs,
    at: {
      type: 'string',
      description: 'Trigger time as unix seconds, unix milliseconds, or ISO-8601',
    },
    clear: {
      type: 'boolean',
      description: 'Clear the scheduled cancel deadline',
      default: false,
    },
  }),
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args))
    await runHyperliquidCommand(out, async () => {
      const ctx = requireHyperliquidWalletContext(args, out)
      const result = await updatePerpScheduleCancel(ctx, {
        at: args.at ? String(args.at) : undefined,
        clear: args.clear === true,
      })
      renderView(out, presentScheduledCancel(result))
    })
  },
})
