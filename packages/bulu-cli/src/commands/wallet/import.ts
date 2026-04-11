import type { WalletInfo } from '@bulu-cli/tcx-core'
import { importWalletKeystore, importWalletMnemonic, importWalletPrivateKey } from '@bulu-cli/tcx-core'
import { defineCommand } from 'citty'
import { readFileSync } from 'node:fs'
import { getVaultPath } from '../../core/config'
import { resolveTCXPassphrase } from '../../core/tcx'
import { renderWalletDetail } from './shared'

export interface WalletImportArgs {
  name: string
  mnemonic?: string
  privateKey?: string
  keystoreFile?: string
  index?: string
  json?: boolean
}

function parseIndex(indexValue?: string): number | undefined {
  if (indexValue === undefined || indexValue === '') {
    return undefined
  }

  const index = Number(indexValue)
  if (!Number.isInteger(index) || index < 0) {
    throw new Error('--index must be a non-negative integer')
  }

  return index
}

function resolveImportSource(args: WalletImportArgs) {
  const mnemonic = args.mnemonic?.trim()
  const privateKey = args.privateKey?.trim()
  const keystoreFile = args.keystoreFile?.trim()

  const providedSources = [
    mnemonic ? 'mnemonic' : null,
    privateKey ? 'privateKey' : null,
    keystoreFile ? 'keystoreFile' : null,
  ].filter((source): source is 'mnemonic' | 'privateKey' | 'keystoreFile' => source !== null)

  if (providedSources.length !== 1) {
    throw new Error('Provide exactly one of --mnemonic, --privateKey, or --keystoreFile')
  }

  return {
    mnemonic,
    privateKey,
    keystoreFile,
    source: providedSources[0],
  }
}

function importFromKeystore(name: string, keystoreFile: string, passphrase: string, vaultPath: string): WalletInfo {
  const keystoreJson = readFileSync(keystoreFile, 'utf-8')
  return importWalletKeystore(name, keystoreJson, passphrase, vaultPath)
}

export async function runWalletImport(args: WalletImportArgs): Promise<void> {
  const name = args.name.trim()
  if (!name) {
    throw new Error('Wallet name is required')
  }

  const index = parseIndex(args.index)
  const { mnemonic, privateKey, keystoreFile, source } = resolveImportSource(args)
  if (source === 'keystoreFile' && index !== undefined) {
    throw new Error('--index is not supported with --keystoreFile')
  }

  const passphrase = await resolveTCXPassphrase()
  const vaultPath = getVaultPath()

  const wallet =
    source === 'mnemonic' && mnemonic
      ? importWalletMnemonic(name, mnemonic, passphrase, vaultPath, index)
      : source === 'privateKey' && privateKey
        ? importWalletPrivateKey(name, privateKey, passphrase, vaultPath, index)
        : importFromKeystore(name, keystoreFile!, passphrase, vaultPath)

  renderWalletDetail(wallet, args)
}

export default defineCommand({
  meta: { name: 'import', description: 'Import a wallet from mnemonic, private key, or keystore JSON' },
  args: {
    name: {
      type: 'positional',
      description: 'Wallet name',
      required: true,
    },
    mnemonic: {
      type: 'string',
      description: 'Mnemonic phrase to import',
    },
    privateKey: {
      type: 'string',
      description: 'Private key to import',
    },
    keystoreFile: {
      type: 'string',
      description: 'Path to a keystore JSON file to import',
    },
    index: {
      type: 'string',
      description: 'Default derivation account index for mnemonic imports',
    },
    json: {
      type: 'boolean',
      description: 'Output in JSON format',
      default: false,
    },
  },
  async run({ args }) {
    await runWalletImport(args as WalletImportArgs)
  },
})
