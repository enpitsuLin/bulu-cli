import { listPolicy, type PolicyInfo } from '@bulu-cli/tcx-core'
import { defineCommand } from 'citty'
import { getVaultPath } from '#/core/config'
import { withArgs } from '#/core/args'
import { useOutput, outputArgs } from '#/core/output'
import { formatTimestamp } from '#/core/time'

function formatPoliciesForTable(policies: PolicyInfo[]) {
  return policies.map((p) => ({
    Name: p.name,
    ID: p.id,
    Rules: p.rules.length,
    Action: p.action,
    Created: formatTimestamp(p.createdAt),
  }))
}

export default defineCommand({
  meta: { name: 'list', description: 'List all signing policies' },
  args: withArgs({}, outputArgs),
  async run() {
    const vaultPath = getVaultPath()
    const policies = listPolicy(vaultPath)
    const output = useOutput()

    if (policies.length === 0) {
      output.warn('No policies found')
      return
    }

    const rows = formatPoliciesForTable(policies)
    output.table(rows, {
      columns: ['Name', 'ID', 'Rules', 'Action', 'Created'],
      title: `Policies (${policies.length})`,
    })
  },
})
