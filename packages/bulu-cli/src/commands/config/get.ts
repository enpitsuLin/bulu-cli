import { defineCommand } from 'citty'
import { useConfig } from '#/core/config'
import { useOutput, withOutputArgs } from '#/core/output'

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
    const config = useConfig()
    const value = config.get(args.key)
    if (value === undefined) {
      throw new Error(`Config key "${args.key}" not found`)
    }

    const output = useOutput()
    output.data(value)
  },
})
