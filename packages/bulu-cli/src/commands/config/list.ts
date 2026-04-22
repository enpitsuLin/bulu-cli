import { useConfig } from '#/core/config'
import { useOutput, withOutputArgs } from '#/core/output'
import { defineCommand } from 'citty'

export default defineCommand({
  meta: { name: 'list', description: 'List config values' },
  args: withOutputArgs({}),
  async run() {
    const config = useConfig()
    const output = useOutput()

    output.data(config.config)
  },
})
