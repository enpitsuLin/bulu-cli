import { defineCommand } from 'citty'
import { useConfig } from '#/core/config'
import { withArgs } from '#/core/args'
import { useOutput, outputArgs } from '#/core/output'

export default defineCommand({
  meta: { name: 'get', description: 'Read a config value by dot path' },
  args: withArgs(
    {
      key: {
        type: 'positional',
        description: 'Config key, for example default.chain',
        required: true,
      },
    },
    outputArgs,
  ),
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
