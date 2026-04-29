import { readFileSync } from 'node:fs'
import { createPolicy } from '@bulu-cli/tcx-core'
import { defineCommand } from 'citty'
import { getVaultPath } from '#/core/config'
import { withArgs } from '#/core/args'
import { useOutput, outputArgs } from '#/core/output'

export default defineCommand({
  meta: {
    name: 'create',
    description: 'Create a signing policy from a JSON file',
  },
  args: withArgs(
    {
      file: {
        type: 'positional',
        description: 'Path to the policy JSON file',
        required: true,
      },
    },
    outputArgs,
  ),
  async run({ args }) {
    const policyJson = readFileSync(args.file, 'utf-8')
    const obj = JSON.parse(policyJson)
    createPolicy({ name: obj.name, rules: obj.rules }, getVaultPath())
    const out = useOutput()
    out.success('Policy created successfully')
  },
})
