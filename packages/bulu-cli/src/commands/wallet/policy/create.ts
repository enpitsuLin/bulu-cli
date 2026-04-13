import { readFileSync } from 'node:fs'
import { createPolicy } from '@bulu-cli/tcx-core'
import { defineCommand } from 'citty'
import { getVaultPath } from '../../../core/config'
import { createOutput, resolveOutputOptions } from '../../../core/output'
import { withDefaultArgs } from '../../../core/args-def'

export default defineCommand({
  meta: {
    name: 'create',
    description: 'Create a signing policy from a JSON file',
  },
  args: withDefaultArgs({
    file: {
      type: 'positional',
      description: 'Path to the policy JSON file',
      required: true,
    },
  }),
  async run({ args }) {
    const policyJson = readFileSync(args.file, 'utf-8')
    const obj = JSON.parse(policyJson)
    createPolicy({ name: obj.name, rules: obj.rules }, getVaultPath())
    const out = createOutput(resolveOutputOptions(args))
    out.success('Policy created successfully')
  },
})
