import { listPolicy, type PolicyInfo } from '@bulu-cli/tcx-core'
import { defineCommand } from 'citty'
import { getVaultPath } from '../../../core/config'
import { createOutput, resolveOutputOptions } from '../../../core/output'
import { withDefaultArgs } from '../../../core/args-def'
import { formatTimestamp } from '../../../core/time'

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
  args: withDefaultArgs({}),
  async run({ args }) {
    const vaultPath = getVaultPath()
    const policies = listPolicy(vaultPath)
    const output = createOutput(resolveOutputOptions(args))

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
