import { defineCommand } from 'citty'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { getVaultPath } from '../../core/config'
import { createOutput, resolveOutputOptions } from '../../core/output'
import { getWallet } from '@bulu-cli/tcx-core'
import { withDefaultArgs } from '../../core/args-def'

const EXPORT_FILE_MODE = 0o600

export default defineCommand({
  meta: { name: 'export', description: 'Export wallet keystore JSON' },
  args: withDefaultArgs({
    wallet: {
      type: 'positional',
      description: 'Wallet name or id',
      required: true,
    },
    file: {
      type: 'string',
      description: 'Write the exported keystore JSON to a file',
    },
  }),
  async run({ args }) {
    const vaultPath = getVaultPath()
    const wallet = getWallet(args.wallet, vaultPath)
    const keystore = wallet.keystore

    const out = createOutput(resolveOutputOptions(args))

    if (!args.file) {
      out.data(keystore)
      return
    }

    const targetPath = resolve(args.file)
    mkdirSync(dirname(targetPath), { recursive: true })
    writeFileSync(targetPath, JSON.stringify(keystore, null, 2), { mode: EXPORT_FILE_MODE })
    out.success(`Exported wallet "${wallet.meta.name}" to ${targetPath}`)
  },
})
