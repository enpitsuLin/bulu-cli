import { defineCommand } from 'citty'
import { createOutput, withOutputArgs } from '../../../core/output'
import { updatePerpScheduleCancel } from '../../../hyperliquid/features/perps/use-cases/perps'
import { marketBaseArgs } from '../../../hyperliquid/shared/args'
import { requireHyperliquidWalletContext } from '../../../hyperliquid/shared/context'
import { runHyperliquidCommand } from '../../../hyperliquid/shared/errors'

export default defineCommand({
  meta: { name: 'schedule-cancel', description: "Manage Hyperliquid's scheduled cancel-all deadline" },
  args: withOutputArgs({
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
    const out = createOutput()
    await runHyperliquidCommand(out, async () => {
      const ctx = requireHyperliquidWalletContext(args, out)
      const result = await updatePerpScheduleCancel(ctx, {
        at: args.at ? String(args.at) : undefined,
        clear: args.clear === true,
      })
      out.table(
        [
          {
            mode: result.cleared ? 'cleared' : 'scheduled',
            time: result.scheduledTime ?? 'N/A',
          },
        ],
        {
          columns: ['mode', 'time'],
          title: `Scheduled Cancel | ${result.walletName} (${result.user})`,
        },
      )
    })
  },
})
