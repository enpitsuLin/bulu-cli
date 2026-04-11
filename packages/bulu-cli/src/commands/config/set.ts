import { defineCommand } from 'citty'
import {
  getConfigPath,
  getConfigValueByPath,
  loadBuluConfigSync,
  loadUserConfigSync,
  saveUserConfigSync,
  setConfigValueByPath,
} from '../../core/config'
import { createConfigCommandOutput, formatConfigValue, parseConfigValue } from './shared'

export interface ConfigSetArgs {
  key: string
  value: string
  json?: boolean
}

export async function runConfigSet(args: ConfigSetArgs): Promise<void> {
  const userConfig = loadUserConfigSync()
  const nextValue = parseConfigValue(args.value)

  setConfigValueByPath(userConfig, args.key, nextValue)
  saveUserConfigSync(userConfig)

  const resolvedValue = getConfigValueByPath(loadBuluConfigSync() as Record<string, unknown>, args.key)
  const output = createConfigCommandOutput(args)

  if (args.json) {
    output.data({
      status: 'success',
      key: args.key,
      value: resolvedValue,
      path: getConfigPath(),
    })
    return
  }

  output.success(`Set ${args.key} = ${formatConfigValue(resolvedValue)}`)
}

export default defineCommand({
  meta: { name: 'set', description: 'Write a config value by dot path' },
  args: {
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
    json: {
      type: 'boolean',
      description: 'Output in JSON format',
      default: false,
    },
  },
  async run({ args }) {
    await runConfigSet(args as ConfigSetArgs)
  },
})
