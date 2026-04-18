import { defineCommand } from 'citty'
import { buildScheduleCancelAction } from '../../../protocols/hyperliquid'
import { createOutput, resolveOutputOptions } from '../../../core/output'
import { handleCommandError, resolvePerpQueryArgs, resolvePerpUserContext, submitExchangeAction } from './shared'
import { executeOrExit } from '../../../utils/cli'

import { parseTimeArg } from './utils'

export default defineCommand({
  meta: { name: 'schedule-cancel', description: "Manage Hyperliquid's scheduled cancel-all deadline" },
  args: resolvePerpQueryArgs({
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
    const { walletName, user } = resolvePerpUserContext(args, out)
    if (args.clear && args.at) {
      out.warn('Use either --clear or --at, not both')
      process.exit(1)
    }
    if (!args.clear && !args.at) {
      out.warn('Provide --at to schedule a cancel or --clear to remove it')
      process.exit(1)
    }

    const scheduledTime = args.at
      ? executeOrExit(out, () => parseTimeArg(String(args.at), 'schedule time'), 'Invalid time')
      : undefined

    await submitExchangeAction({
      action: buildScheduleCancelAction(args.clear ? undefined : scheduledTime),
      walletName,
      testnet: args.testnet,
    }).catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      handleCommandError(out, `Failed to update scheduled cancel: ${message}`)
    })

    const row = {
      mode: args.clear ? 'cleared' : 'scheduled',
      time: scheduledTime ?? 'N/A',
    }

    out.table([row], { columns: ['mode', 'time'], title: `Scheduled Cancel | ${walletName} (${user})` })
  },
})
