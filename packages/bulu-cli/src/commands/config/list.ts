import { defineCommand } from 'citty'
import { loadBuluConfigSync } from '../../core/config'
import { flattenConfigRows } from './shared'
import { createOutput, withOutputArgs } from '../../core/output'

export default defineCommand({
  meta: { name: 'list', description: 'List config values' },
  args: withOutputArgs({}),
  async run() {
    const config = loadBuluConfigSync() as Record<string, unknown>
    const output = createOutput()

    const rows = flattenConfigRows(config)
    if (rows.length === 0) {
      output.warn('No config values found')
      return
    }

    output.table(rows, {
      columns: ['Key', 'Value'],
      title: `Config (${rows.length})`,
    })
  },
})
