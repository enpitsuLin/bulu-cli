import { revokeApiKey } from '@bulu-cli/tcx-core'
import { defineCommand } from 'citty'
import { getVaultPath } from '#/core/config'
import { useOutput } from '#/core/output'
import { withOutputArgs } from '#/core/output'

export default defineCommand({
  meta: { name: 'revoke', description: 'Revoke an API key' },
  args: withOutputArgs({
    name: {
      type: 'positional',
      description: 'API key name or ID',
      required: true,
    },
    confirm: {
      type: 'boolean',
      description: 'Confirm revocation',
      default: false,
    },
  }),
  async run({ args }) {
    const out = useOutput()
    if (!args.confirm) {
      out.warn('This will permanently revoke the API key. Pass --confirm to proceed.')
      process.exit(1)
    }
    const vaultPath = getVaultPath()
    revokeApiKey(args.name, vaultPath)
    out.success(`Revoked API key "${args.name}"`)
  },
})
