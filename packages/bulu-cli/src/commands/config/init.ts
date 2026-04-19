import { defineCommand } from 'citty'
import { initBuluConfigSync, withConfigArgs } from '#/core/config'
import { useOutput, withOutputArgs } from '#/core/output'

export default defineCommand({
  meta: { name: 'init', description: 'Create the default bulu config file' },
  args: withOutputArgs(
    withConfigArgs({
      force: {
        type: 'boolean',
        description: 'Overwrite the config file with default values',
        default: false,
      },
    }),
  ),
  async run({ args }) {
    const result = initBuluConfigSync({ force: args.force })
    const output = useOutput()

    if (result.action === 'created') {
      output.success(`Initialized config at ${result.path}`)
      return
    }

    if (result.action === 'overwritten') {
      output.success(`Reinitialized config at ${result.path}`)
      return
    }

    output.success(`Config already exists at ${result.path}`)
  },
})
