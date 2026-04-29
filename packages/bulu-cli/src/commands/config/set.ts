import { defineCommand } from 'citty'
import { useConfig } from '#/core/config'
import { withArgs } from '#/core/args'
import { useOutput, outputArgs } from '#/core/output'

export default defineCommand({
  meta: { name: 'set', description: 'Write a config value by dot path' },
  args: withArgs(
    {
      key: {
        type: 'positional',
        description: 'Config key, for example default.wallet',
        required: true,
      },
      value: {
        type: 'positional',
        description: 'Config value; JSON, booleans, null, and numbers are parsed automatically',
        required: true,
      },
    },
    outputArgs,
  ),
  async run({ args }) {
    const config = useConfig()
    const output = useOutput()

    config.set(args.key, args.value)
    output.success(`Set ${args.key} = ${args.value}`)
  },
})
