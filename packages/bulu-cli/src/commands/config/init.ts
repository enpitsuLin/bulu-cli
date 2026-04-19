import { defineCommand } from 'citty'
import { initBuluConfigSync } from '../../core/config'
import { createOutput } from '../../core/output'

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
    const result = initBuluConfigSync({ force: args.force })
    const output = createOutput()

    if (result.action === 'created') {
      output.success(`Initialized config at ${result.path}`)
      return
    }

    if (result.action === 'overwritten') {
      output.success(`Reinitialized config at ${result.path}`)
      return
    }

    output.success(`Config already exists at ${result.path}`)
  },
})
