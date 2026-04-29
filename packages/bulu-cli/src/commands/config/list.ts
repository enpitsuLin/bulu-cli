import { useConfig } from '#/core/config'
import { withArgs } from '#/core/args'
import { useOutput, outputArgs } from '#/core/output'
import { defineCommand } from 'citty'

export default defineCommand({
  meta: { name: 'list', description: 'List config values' },
  args: withArgs({}, outputArgs),
  async run() {
    const config = useConfig()
    const output = useOutput()

    output.data(config.config)
  },
})
