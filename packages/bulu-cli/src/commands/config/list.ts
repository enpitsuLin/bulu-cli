import { defineCommand } from 'citty'
import { loadBuluConfigSync } from '../../core/config'
import { flattenConfigRows, resolveConfigListOutput, type ConfigListOutputArgs } from './shared'

export async function runConfigList(args: ConfigListOutputArgs): Promise<void> {
  const config = loadBuluConfigSync() as Record<string, unknown>
  const { output, outputOpts } = resolveConfigListOutput(args)

  if (outputOpts.json) {
    output.data(config)
    return
  }

  const rows = flattenConfigRows(config)
  if (rows.length === 0) {
    output.warn('No config values found')
    return
  }

  output.table(rows, {
    columns: ['Key', 'Value'],
    title: `Config (${rows.length})`,
  })
}

export default defineCommand({
  meta: { name: 'list', description: 'List config values' },
  args: {
    json: {
      type: 'boolean',
      description: 'Output in JSON format',
      default: false,
    },
    format: {
      type: 'string',
      description: 'Output format (table, csv, json)',
      default: 'table',
    },
  },
  async run({ args }) {
    await runConfigList(args as ConfigListOutputArgs)
  },
})
