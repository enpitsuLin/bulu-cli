import { defineCommand } from 'citty'
import { initBuluConfigSync } from '../../core/config'
import { createConfigCommandOutput } from './shared'

export interface ConfigInitArgs {
  force?: boolean
  json?: boolean
}

export async function runConfigInit(args: ConfigInitArgs): Promise<void> {
  const result = initBuluConfigSync({ force: args.force })
  const output = createConfigCommandOutput(args)

  if (args.json) {
    output.data({
      status: 'success',
      action: result.action,
      path: result.path,
      config: result.config,
    })
    return
  }

  if (result.action === 'created') {
    output.success(`Initialized config at ${result.path}`)
    return
  }

  if (result.action === 'overwritten') {
    output.success(`Reinitialized config at ${result.path}`)
    return
  }

  output.success(`Config already exists at ${result.path}`)
}

export default defineCommand({
  meta: { name: 'init', description: 'Create the default bulu config file' },
  args: {
    force: {
      type: 'boolean',
      description: 'Overwrite the config file with default values',
      default: false,
    },
    json: {
      type: 'boolean',
      description: 'Output in JSON format',
      default: false,
    },
  },
  async run({ args }) {
    await runConfigInit(args as ConfigInitArgs)
  },
})
