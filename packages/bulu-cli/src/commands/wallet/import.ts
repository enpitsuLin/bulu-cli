import type { WalletInfo } from '@bulu-cli/tcx-core'
import { importWalletKeystore, importWalletMnemonic, importWalletPrivateKey } from '@bulu-cli/tcx-core'
import { defineCommand } from 'citty'
import { readFileSync } from 'node:fs'
import { getVaultPath } from '../../core/config'
import { resolveTCXPassphrase } from '../../core/tcx'
import { createOutput, resolveOutputOptions } from '../../core/output'
import { withDefaultArgs } from '../../core/args-def'

function parseIndex(indexValue?: string): number | undefined {
  if (!indexValue) return undefined
  const index = Number(indexValue)
  if (!Number.isInteger(index) || index < 0) {
    throw new Error('--index must be a non-negative integer')
  }
  return index
}

export default defineCommand({
  meta: { name: 'import', description: 'Import a wallet from mnemonic, private key, or keystore JSON' },
  args: withDefaultArgs({
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
  }),
  async run({ args }) {
    const name = args.name.trim()

    const out = createOutput(resolveOutputOptions(args))
    if (!name) {
      out.warn('Wallet name is required')
      process.exit(1)
    }

    const index = parseIndex(args.index)
    const mnemonic = args.mnemonic?.trim()
    const privateKey = args.privateKey?.trim()
    const keystoreFile = args.keystoreFile?.trim()

    const sourceCount = (mnemonic ? 1 : 0) + (privateKey ? 1 : 0) + (keystoreFile ? 1 : 0)
    if (sourceCount !== 1) {
      out.warn('Provide exactly one of --mnemonic, --privateKey, or --keystoreFile')
      process.exit(1)
    }
    if (keystoreFile && index !== undefined) {
      out.warn('--index is not supported with --keystoreFile')
      process.exit(1)
    }

    const passphrase = await resolveTCXPassphrase()
    const vaultPath = getVaultPath()

    let wallet: WalletInfo
    try {
      if (mnemonic) {
        wallet = importWalletMnemonic(name, mnemonic, passphrase, vaultPath, index)
      } else if (privateKey) {
        wallet = importWalletPrivateKey(name, privateKey, passphrase, vaultPath, index)
      } else {
        const keystoreJson = readFileSync(keystoreFile!, 'utf-8')
        wallet = importWalletKeystore(name, keystoreJson, passphrase, vaultPath)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      out.warn(`Error: ${message}`)
      process.exit(1)
    }

    out.data({
      name: wallet.meta.name,
      id: wallet.meta.id,
      accounts: wallet.accounts.map((a) => ({
        chain: a.chainId,
        address: a.address,
        path: a.derivationPath,
      })),
    })
  },
})
