import { defineCommand } from 'citty'
import { getConfigValueByPath, loadBuluConfigSync } from '#/core/config'
import { createOutput, withOutputArgs } from '#/core/output'

export default defineCommand({
  meta: { name: 'get', description: 'Read a config value by dot path' },
  args: withOutputArgs({
    key: {
      type: 'positional',
      description: 'Config key, for example default.chain',
      required: true,
    },
  }),
  async run({ args }) {
    const value = getConfigValueByPath(loadBuluConfigSync() as Record<string, unknown>, args.key)
    if (value === undefined) {
      throw new Error(`Config key "${args.key}" not found`)
    }

    const output = createOutput()
    output.data(value)
  },
})
