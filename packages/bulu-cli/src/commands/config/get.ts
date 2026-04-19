import { defineCommand } from 'citty'
import { getConfigValueByPath, loadBuluConfigSync, withConfigArgs } from '#/core/config'
import { useOutput, withOutputArgs } from '#/core/output'

export default defineCommand({
  meta: { name: 'get', description: 'Read a config value by dot path' },
  args: withOutputArgs(
    withConfigArgs({
      key: {
        type: 'positional',
        description: 'Config key, for example default.chain',
        required: true,
      },
    }),
  ),
  async run({ args }) {
    const value = getConfigValueByPath(loadBuluConfigSync() as Record<string, unknown>, args.key)
    if (value === undefined) {
      throw new Error(`Config key "${args.key}" not found`)
    }

    const output = useOutput()
    output.data(value)
  },
})
