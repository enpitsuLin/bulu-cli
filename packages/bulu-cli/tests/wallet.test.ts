import type { WalletInfo } from '@bulu-cli/tcx-core'
import { importWalletMnemonic, listWallet, loadWallet } from '@bulu-cli/tcx-core'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { runWalletDelete } from '../src/commands/wallet/delete'
import { runWalletExport } from '../src/commands/wallet/export'
import { runWalletImport } from '../src/commands/wallet/import'
import { runWalletInfo } from '../src/commands/wallet/info'
import { resolveStoredWallet } from '../src/core/wallet-store'

vi.mock('@bulu-cli/tcx-core', () => ({
  listWallet: vi.fn(),
  importWalletMnemonic: vi.fn(),
  importWalletPrivateKey: vi.fn(),
  loadWallet: vi.fn(),
}))

function createWalletFixture(options?: {
  id?: string
  name?: string
  source?: 'MNEMONIC' | 'PRIVATE'
  derivable?: boolean
}): WalletInfo {
  const id = options?.id ?? 'wallet-1'
  const name = options?.name ?? 'Main'
  const source = options?.source ?? 'MNEMONIC'
  const derivable = options?.derivable ?? true

  return {
    keystore: {
      id,
      version: derivable ? 12000 : 12001,
      sourceFingerprint: 'fingerprint',
      crypto: {
        cipher: 'aes-128-ctr',
        cipherparams: { iv: 'iv' },
        ciphertext: 'ciphertext',
        kdf: 'pbkdf2',
        kdfparams: {
          dklen: 32,
          salt: 'salt',
          c: 10240,
          prf: 'hmac-sha256',
        },
        mac: 'mac',
      },
      identity: {
        encAuthKey: { encStr: 'enc', nonce: 'nonce' },
        encKey: 'enc-key',
        identifier: 'identifier',
        ipfsId: 'ipfs-id',
      },
      curve: derivable ? undefined : 'secp256k1',
      encOriginal: { encStr: 'enc-original', nonce: 'nonce-original' },
      imTokenMeta: {
        name,
        timestamp: 1712812800,
        source,
        network: 'MAINNET',
        passwordHint: 'hint',
        identifiedChainTypes: ['ETHEREUM', 'TRON'],
      },
    },
    meta: {
      id,
      version: derivable ? 12000 : 12001,
      sourceFingerprint: 'fingerprint',
      source,
      network: 'MAINNET',
      name,
      passwordHint: 'hint',
      timestamp: 1712812800,
      derivable,
      curve: derivable ? undefined : 'secp256k1',
      identifiedChainTypes: ['ETHEREUM', 'TRON'],
    },
    accounts: [
      {
        chainId: 'eip155:1',
        address: '0xabc',
        publicKey: '0xpub',
        derivationPath: derivable ? "m/44'/60'/0'/0/0" : undefined,
        extPubKey: derivable ? 'xpub' : undefined,
      },
      {
        chainId: 'tron:0x2b6653dc',
        address: 'TXYZ',
        publicKey: '0xtronpub',
        derivationPath: derivable ? "m/44'/195'/0'/0/0" : undefined,
        extPubKey: derivable ? 'tron-xpub' : undefined,
      },
    ],
  }
}

function writeStoredWallet(configDir: string, wallet: WalletInfo): string {
  const walletPath = join(configDir, 'vault', 'wallets', `${wallet.meta.id}.json`)
  mkdirSync(join(configDir, 'vault', 'wallets'), { recursive: true })
  writeFileSync(walletPath, JSON.stringify(wallet, null, 2))
  return walletPath
}

function captureStdout() {
  let output = ''
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
    output += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8')
    return true
  }) as typeof process.stdout.write)

  return {
    read: () => output,
    restore: () => spy.mockRestore(),
  }
}

describe('wallet commands', () => {
  let configDir = ''

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'bulu-cli-wallet-test-'))
    process.env.BULU_CONFIG_DIR = configDir
    process.env.TCX_PASSPHRASE = 'secret'
    vi.clearAllMocks()
  })

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true })
    delete process.env.BULU_CONFIG_DIR
    delete process.env.TCX_PASSPHRASE
    vi.restoreAllMocks()
  })

  test('wallet import uses mnemonic source and prints wallet json', async () => {
    const wallet = createWalletFixture({ name: 'Imported' })
    vi.mocked(importWalletMnemonic).mockReturnValue(wallet)

    const stdout = captureStdout()
    await runWalletImport({
      name: 'Imported',
      mnemonic: 'seed words',
      index: '1',
      json: true,
    })
    stdout.restore()

    expect(importWalletMnemonic).toHaveBeenCalledWith('Imported', 'seed words', 'secret', join(configDir, 'vault'), 1)
    expect(JSON.parse(stdout.read())).toMatchObject({
      meta: { name: 'Imported' },
    })
  })

  test('wallet import restores keystore file into the vault with a new name', async () => {
    const wallet = createWalletFixture({ id: 'wallet-restore', name: 'Old Name' })
    const keystoreFile = join(configDir, 'backup.json')
    writeFileSync(keystoreFile, JSON.stringify(wallet.keystore))
    vi.mocked(loadWallet).mockReturnValue(wallet)

    const stdout = captureStdout()
    await runWalletImport({
      name: 'Restored',
      keystoreFile,
      json: true,
    })
    stdout.restore()

    const persistedPath = join(configDir, 'vault', 'wallets', 'wallet-restore.json')
    const persisted = JSON.parse(readFileSync(persistedPath, 'utf-8')) as WalletInfo

    expect(loadWallet).toHaveBeenCalledWith(JSON.stringify(wallet.keystore), 'secret')
    expect(persisted.meta.name).toBe('Restored')
    expect(persisted.keystore.imTokenMeta.name).toBe('Restored')
    expect(JSON.parse(stdout.read())).toMatchObject({
      meta: { name: 'Restored' },
    })
  })

  test('wallet info omits curve and account keys from json output', async () => {
    const wallet = createWalletFixture({ id: 'wallet-info', name: 'Info Wallet', derivable: false })
    writeStoredWallet(configDir, wallet)
    vi.mocked(listWallet).mockReturnValue([wallet])

    const stdout = captureStdout()
    await runWalletInfo({
      wallet: 'Info Wallet',
      json: true,
    })
    stdout.restore()

    const output = JSON.parse(stdout.read()) as WalletInfo

    expect(output).toMatchObject({
      meta: { id: 'wallet-info', name: 'Info Wallet' },
    })
    expect(output.accounts[0]).toMatchObject({
      chainId: 'eip155:1',
      address: '0xabc',
    })
    expect(output.meta).not.toHaveProperty('curve')
    expect(output.accounts[0]).not.toHaveProperty('publicKey')
    expect(output.accounts[0]).not.toHaveProperty('extPubKey')
    expect(stdout.read()).not.toContain('curve')
    expect(stdout.read()).not.toContain('publicKey')
    expect(stdout.read()).not.toContain('extPubKey')
  })

  test('wallet export writes keystore json to the requested file', async () => {
    const wallet = createWalletFixture({ id: 'wallet-export', name: 'Export Wallet' })
    writeStoredWallet(configDir, wallet)
    vi.mocked(listWallet).mockReturnValue([wallet])

    const targetFile = join(configDir, 'exports', 'wallet.json')

    const stdout = captureStdout()
    await runWalletExport({
      wallet: 'Export Wallet',
      file: targetFile,
      json: true,
    })
    stdout.restore()

    expect(JSON.parse(readFileSync(targetFile, 'utf-8'))).toEqual(wallet.keystore)
    expect(JSON.parse(stdout.read())).toMatchObject({
      status: 'success',
    })
  })

  test('resolveStoredWallet rejects duplicate wallet names', () => {
    vi.mocked(listWallet).mockReturnValue([
      createWalletFixture({ id: 'wallet-a', name: 'Duplicate' }),
      createWalletFixture({ id: 'wallet-b', name: 'Duplicate' }),
    ])

    expect(() => resolveStoredWallet('Duplicate', join(configDir, 'vault'))).toThrow(
      'Multiple wallets share the name "Duplicate"',
    )
  })

  test('wallet delete removes the file and clears the matching default wallet', async () => {
    const wallet = createWalletFixture({ id: 'wallet-delete', name: 'Delete Wallet' })
    const walletPath = writeStoredWallet(configDir, wallet)
    writeFileSync(
      join(configDir, 'bulu.config.json'),
      JSON.stringify(
        {
          default: {
            wallet: 'Delete Wallet',
            chain: 'ethereum',
          },
        },
        null,
        2,
      ),
    )

    vi.mocked(listWallet).mockReturnValueOnce([wallet]).mockReturnValueOnce([])

    const stdout = captureStdout()
    await runWalletDelete({
      wallet: 'Delete Wallet',
      force: true,
      json: true,
    })
    stdout.restore()

    const config = JSON.parse(readFileSync(join(configDir, 'bulu.config.json'), 'utf-8')) as {
      default?: Record<string, string>
    }

    expect(() => readFileSync(walletPath, 'utf-8')).toThrow()
    expect(config.default).toEqual({ chain: 'ethereum' })
    expect(JSON.parse(stdout.read())).toMatchObject({
      status: 'success',
    })
  })
})
