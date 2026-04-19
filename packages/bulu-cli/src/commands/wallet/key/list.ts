import { listApiKey, type ApiKeyInfo } from '@bulu-cli/tcx-core'
import { defineCommand } from 'citty'
import { getVaultPath, withConfigArgs } from '#/core/config'
import { useOutput } from '#/core/output'
import { withOutputArgs } from '#/core/output'
import { formatOptionalTimestamp } from '#/core/time'

function formatApiKeysForTable(apiKeys: ApiKeyInfo[]) {
  return apiKeys.map((k) => ({
    Name: k.name,
    ID: k.id,
    Wallets: k.walletIds.length,
    Policies: k.policyIds.length,
    Expires: formatOptionalTimestamp(k.expiresAt),
  }))
}

export default defineCommand({
  meta: { name: 'list', description: 'List all API keys' },
  args: withOutputArgs(withConfigArgs({})),
  async run() {
    const vaultPath = getVaultPath()
    const apiKeys = listApiKey(vaultPath)
    const output = useOutput()

    if (apiKeys.length === 0) {
      output.warn('No API keys found')
      return
    }

    const rows = formatApiKeysForTable(apiKeys)
    output.table(rows, {
      columns: ['Name', 'ID', 'Wallets', 'Policies', 'Expires'],
      title: `API Keys (${apiKeys.length})`,
    })
  },
})
