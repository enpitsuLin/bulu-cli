import { readFileSync } from 'node:fs'
import { createPolicy } from '@bulu-cli/tcx-core'
import { defineCommand } from 'citty'
import { getVaultPath, withConfigArgs } from '#/core/config'
import { useOutput } from '#/core/output'
import { withOutputArgs } from '#/core/output'

export default defineCommand({
  meta: {
    name: 'create',
    description: 'Create a signing policy from a JSON file',
  },
  args: withOutputArgs(
    withConfigArgs({
      file: {
        type: 'positional',
        description: 'Path to the policy JSON file',
        required: true,
      },
    }),
  ),
  async run({ args }) {
    const policyJson = readFileSync(args.file, 'utf-8')
    const obj = JSON.parse(policyJson)
    createPolicy({ name: obj.name, rules: obj.rules }, getVaultPath())
    const out = useOutput()
    out.success('Policy created successfully')
  },
})
