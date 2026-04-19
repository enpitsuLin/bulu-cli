import { defineCommand } from 'citty'
import { withOutputArgs } from '#/core/output'

export default defineCommand({
  meta: { name: 'init', description: 'Create the default bulu config file' },
  args: withOutputArgs({
    force: {
      type: 'boolean',
      description: 'Overwrite the config file with default values',
      default: false,
    },
  }),
  async run() {
    throw new Error("don't implement")
  },
})
