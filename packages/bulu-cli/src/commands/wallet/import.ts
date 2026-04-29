import type { WalletInfo } from '@bulu-cli/tcx-core'
import { importWalletKeystore, importWalletMnemonic, importWalletPrivateKey } from '@bulu-cli/tcx-core'
import { defineCommand } from 'citty'
import { styleText } from 'node:util'
import { readFileSync } from 'node:fs'
import { getVaultPath, useConfig } from '#/core/config'
import { resolveTCXPassphrase } from '#/core/tcx'
import { withArgs } from '#/core/args'
import { useOutput, outputArgs } from '#/core/output'

function parseIndex(indexValue?: string): number | undefined {
  if (!indexValue) return undefined
  const index = Number(indexValue)
  if (!Number.isInteger(index) || index < 0) {
    throw new Error('--index must be a non-negative integer')
  }
  return index
}

function formatWalletOutput(wallet: WalletInfo) {
  return {
    name: wallet.meta.name,
    id: wallet.meta.id,
    accounts: wallet.accounts.map((a) => ({
      chain: a.chainId,
      address: a.address,
      path: a.derivationPath,
    })),
  }
}

function detectIsMnemonic(secret: string): boolean {
  return secret.split(/\s+/).length >= 12
}

async function readSecretFromStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf-8').trim()
}

export default defineCommand({
  meta: {
    name: 'import',
    description: 'Import a wallet from private key, mnemonic, or keystore JSON',
  },
  args: withArgs(
    {
      name: {
        type: 'positional',
        description: 'Wallet name',
        required: true,
      },
      key: {
        type: 'positional',
        description: 'Private key (or use stdin/--file/--mnemonic)',
        required: false,
      },
      mnemonic: {
        type: 'boolean',
        description: 'Import from mnemonic phrase (interactive prompt)',
        default: false,
      },
      keystore: {
        type: 'boolean',
        description: 'Import from keystore JSON (interactive prompt)',
        default: false,
      },
      file: {
        type: 'string',
        description: 'Read key or mnemonic from file',
      },
      index: {
        type: 'string',
        description: 'Default derivation account index for mnemonic imports',
      },
    },
    outputArgs,
  ),
  async run({ args }) {
    const name = args.name.trim()
    const out = useOutput()
    const config = useConfig()

    if (!name) {
      out.warn('Wallet name is required')
      process.exit(1)
    }

    // Validate mutually exclusive options
    const sourceCount = (args.mnemonic ? 1 : 0) + (args.keystore ? 1 : 0) + (args.file ? 1 : 0) + (args.key ? 1 : 0)

    if (sourceCount > 1) {
      out.warn('Provide only one of: positional key, --mnemonic, --keystore, or --file')
      process.exit(1)
    }

    const index = parseIndex(args.index)

    // Keystore import doesn't work with index
    if (args.keystore && index !== undefined) {
      out.warn('--index is not supported with --keystore')
      process.exit(1)
    }

    const passphrase = await resolveTCXPassphrase()
    const vaultPath = getVaultPath()

    let wallet: WalletInfo

    try {
      // Mnemonic import (interactive)
      if (args.mnemonic) {
        const clack = await import('@clack/prompts')
        const value = await clack.text({
          message: 'Enter mnemonic phrase:',
          placeholder: 'word1 word2 word3 ...',
        })
        if (!value || typeof value === 'symbol') {
          out.warn('No mnemonic provided')
          process.exit(6)
        }
        wallet = importWalletMnemonic(name, value, passphrase, vaultPath, index)
      } else if (args.keystore) {
        // Keystore import (interactive)
        const clack = await import('@clack/prompts')
        const value = await clack.text({
          message: 'Enter keystore JSON:',
          placeholder: '{"version":12000,...}',
        })
        if (!value || typeof value === 'symbol') {
          out.warn('No keystore JSON provided')
          process.exit(6)
        }
        wallet = importWalletKeystore(name, value, passphrase, vaultPath)
      } else {
        // Read secret from source
        let secret: string
        if (args.file) {
          secret = readFileSync(args.file, 'utf-8').trim()
        } else if (args.key) {
          console.error(styleText('yellow', 'Warning: Private key in CLI args is visible in shell history.'))
          secret = args.key
        } else if (process.stdin.isTTY) {
          const clack = await import('@clack/prompts')
          const value = await clack.password({ message: 'Enter private key or mnemonic:' })
          if (!value || typeof value === 'symbol') {
            out.warn('No key provided')
            process.exit(6)
          }
          secret = value
        } else {
          secret = await readSecretFromStdin()
        }

        if (!secret) {
          out.warn('No key or mnemonic provided')
          process.exit(1)
        }

        // Detect if the secret looks like a mnemonic
        const isMnemonic = detectIsMnemonic(secret)

        if (isMnemonic) {
          wallet = importWalletMnemonic(name, secret, passphrase, vaultPath, index)
        } else {
          wallet = importWalletPrivateKey(name, secret, passphrase, vaultPath)
        }
      }

      config.set('default.wallet', wallet.meta.name)
      out.data(formatWalletOutput(wallet))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      out.warn(`Error: ${message}`)
      process.exit(1)
    }
  },
})
