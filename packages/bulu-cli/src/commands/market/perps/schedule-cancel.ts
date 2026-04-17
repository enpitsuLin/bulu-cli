import { defineCommand } from 'citty'
import { buildScheduleCancelAction } from '../../../protocols/hyperliquid'
import {
  handleCommandError,
  resolvePerpOutput,
  resolvePerpQueryArgs,
  resolvePerpUserContext,
  submitExchangeAction,
} from './shared'
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
    const out = resolvePerpOutput(args)
    const { walletName, user } = resolvePerpUserContext(args, out)
    if (args.clear && args.at) {
      out.warn('Use either --clear or --at, not both')
      process.exit(1)
    }
    if (!args.clear && !args.at) {
      out.warn('Provide --at to schedule a cancel or --clear to remove it')
      process.exit(1)
    }

    let scheduledTime: number | undefined
    if (args.at) {
      try {
        scheduledTime = parseTimeArg(String(args.at), 'schedule time')
      } catch (error) {
        handleCommandError(out, error instanceof Error ? error.message : String(error))
      }
    }

    try {
      const response = await submitExchangeAction({
        action: buildScheduleCancelAction(args.clear ? undefined : scheduledTime),
        walletName,
        testnet: args.testnet,
      })

      const row = {
        mode: args.clear ? 'cleared' : 'scheduled',
        time: scheduledTime ?? 'N/A',
      }

      if (args.json || args.format === 'json') {
        out.data({ wallet: walletName, user, scheduleCancel: row, response })
        return
      }

      if (args.format === 'csv') {
        out.data('mode,time')
        out.data(`${row.mode},${row.time}`)
        return
      }

      out.table([row], {
        columns: ['mode', 'time'],
        title: `Scheduled Cancel | ${walletName} (${user})`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      handleCommandError(out, `Failed to update scheduled cancel: ${message}`)
    }
  },
})
