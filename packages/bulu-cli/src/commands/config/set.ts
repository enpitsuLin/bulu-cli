import { defineCommand } from 'citty'
import {
  getConfigValueByPath,
  loadBuluConfigSync,
  loadUserConfigSync,
  saveUserConfigSync,
  setConfigValueByPath,
} from '../../core/config'
import { formatConfigValue, parseConfigValue } from './shared'
import { createOutput, withOutputArgs } from '../../core/output'

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
    const userConfig = loadUserConfigSync()
    const nextValue = parseConfigValue(args.value)

    setConfigValueByPath(userConfig, args.key, nextValue)
    saveUserConfigSync(userConfig)

    const resolvedValue = getConfigValueByPath(loadBuluConfigSync() as Record<string, unknown>, args.key)
    const output = createOutput()

    output.success(`Set ${args.key} = ${formatConfigValue(resolvedValue)}`)
  },
})
