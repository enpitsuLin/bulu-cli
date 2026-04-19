import { defineCommand } from 'citty'
import { getConfigValueByPath, setConfigValue, useConfig } from '#/core/config'
import { formatConfigValue, parseConfigValue } from './shared'
import { useOutput, withOutputArgs } from '#/core/output'

export default defineCommand({
  meta: { name: 'set', description: 'Write a config value by dot path' },
  args: withOutputArgs({
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
  }),
  async run({ args }) {
    const nextValue = parseConfigValue(args.value)

    setConfigValue(args.key, nextValue)

    const config = useConfig()
    const resolvedValue = getConfigValueByPath(config, args.key)
    const output = useOutput()

    output.success(`Set ${args.key} = ${formatConfigValue(resolvedValue)}`)
  },
})
