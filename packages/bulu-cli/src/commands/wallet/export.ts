import { defineCommand } from 'citty'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { getVaultPath } from '../../core/config'
import { resolveStoredWallet } from '../../core/wallet-store'
import { createWalletCommandOutput } from './shared'

const EXPORT_FILE_MODE = 0o600

export interface WalletExportArgs {
  wallet: string
  file?: string
  json?: boolean
}

export async function runWalletExport(args: WalletExportArgs): Promise<void> {
  const vaultPath = getVaultPath()
  const storedWallet = resolveStoredWallet(args.wallet, vaultPath)
  const keystore = storedWallet.data.keystore
  const output = createWalletCommandOutput(args)

  if (!args.file) {
    output.data(keystore)
    return
  }

  const targetPath = resolve(args.file)
  mkdirSync(dirname(targetPath), { recursive: true })
  writeFileSync(targetPath, JSON.stringify(keystore, null, 2), { mode: EXPORT_FILE_MODE })
  output.success(`Exported wallet "${storedWallet.wallet.meta.name}" to ${targetPath}`)
}

export default defineCommand({
  meta: { name: 'export', description: 'Export wallet keystore JSON' },
  args: {
    wallet: {
      type: 'positional',
      description: 'Wallet name or id',
      required: true,
    },
    file: {
      type: 'string',
      description: 'Write the exported keystore JSON to a file',
    },
    json: {
      type: 'boolean',
      description: 'Output status in JSON format',
      default: false,
    },
  },
  async run({ args }) {
    await runWalletExport(args as WalletExportArgs)
  },
})
