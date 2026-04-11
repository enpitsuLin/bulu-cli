import { defineCommand } from 'citty'
import { getConfigValueByPath, loadBuluConfigSync } from '../../core/config'
import { createConfigCommandOutput } from './shared'

export interface ConfigGetArgs {
  key: string
  json?: boolean
}

export async function runConfigGet(args: ConfigGetArgs): Promise<void> {
  const value = getConfigValueByPath(loadBuluConfigSync() as Record<string, unknown>, args.key)
  if (value === undefined) {
    throw new Error(`Config key "${args.key}" not found`)
  }

  const output = createConfigCommandOutput(args)
  output.data(value)
}

export default defineCommand({
  meta: { name: 'get', description: 'Read a config value by dot path' },
  args: {
    key: {
      type: 'positional',
      description: 'Config key, for example default.chain',
      required: true,
    },
    json: {
      type: 'boolean',
      description: 'Output in JSON format',
      default: false,
    },
  },
  async run({ args }) {
    await runConfigGet(args as ConfigGetArgs)
  },
})
