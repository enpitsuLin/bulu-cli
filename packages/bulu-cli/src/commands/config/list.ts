import { defineCommand } from 'citty'
import { useConfig } from '#/core/config'
import { flattenConfigRows } from './shared'
import { useOutput, withOutputArgs } from '#/core/output'

export default defineCommand({
  meta: { name: 'list', description: 'List config values' },
  args: withOutputArgs({}),
  async run() {
    const config = useConfig()
    const output = useOutput()

    const rows = flattenConfigRows(config as Record<string, unknown>)
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
