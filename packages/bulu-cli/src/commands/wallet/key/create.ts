import { createApiKey } from '@bulu-cli/tcx-core'
import { defineCommand } from 'citty'
import { getVaultPath, useConfig } from '#/core/config'
import { useOutput } from '#/core/output'
import { withOutputArgs } from '#/core/output'
import { resolveTCXPassphrase } from '#/core/tcx'
import { formatTimestamp } from '#/core/time'

function splitIds(value?: string): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export default defineCommand({
  meta: {
    name: 'create',
    description: 'Create an API key for agent-mode signing',
  },
  args: withOutputArgs({
    name: {
      type: 'positional',
      description: 'API key name',
      required: true,
    },
    wallet: {
      type: 'string',
      description: 'Comma-separated wallet names or ids to bind (defaults to active wallet)',
    },
    policy: {
      type: 'string',
      description: 'Comma-separated policy names or ids to attach',
    },
    'expires-at': {
      type: 'string',
      description: 'Optional expiry timestamp (Unix seconds)',
    },
  }),
  async run({ args }) {
    const vaultPath = getVaultPath()
    const config = useConfig()
    const out = useOutput()

    let walletIds = splitIds(args.wallet)
    if (walletIds.length === 0) {
      const active = config.config.default?.wallet
      if (!active) {
        out.warn('No active wallet configured. Pass --wallet to bind the API key.')
        process.exit(1)
      }
      walletIds = [active]
    }

    const policyIds = splitIds(args.policy)
    const expiresAt = args['expires-at'] ? Number(args['expires-at']) : undefined
    const passphrase = await resolveTCXPassphrase()

    try {
      const result = createApiKey(args.name, walletIds, policyIds, passphrase, expiresAt, vaultPath)

      out.data(`ID: ${result.id}`)
      out.data(`Name: ${result.apiKey.name}`)
      out.data(`Token: ${result.token}`)
      out.data(`Wallets: ${result.apiKey.walletIds.join(', ') || '(none)'}`)
      out.data(`Policies: ${result.apiKey.policyIds.join(', ') || '(none)'}`)
      if (result.apiKey.expiresAt) {
        out.data(`Expires at: ${formatTimestamp(result.apiKey.expiresAt)}`)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      out.warn(`Error: ${message}`)
      process.exit(1)
    }
  },
})
