import { expect, test } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  createApiKey,
  createPolicy,
  type KeystoreData,
  type WalletInfo,
  createWallet,
  deleteWallet,
  deriveAccounts,
  getWallet,
  importWalletKeystore,
  importWalletMnemonic,
  importWalletPrivateKey,
  revokeApiKey,
  listWallet,
  loadWallet,
  signMessage,
  signTransaction,
} from '../index'
import { Buffer } from 'node:buffer'

/** Helper to convert KeystoreData object to JSON string for functions that need it */
function keystoreToJson(keystore: KeystoreData): string {
  return JSON.stringify(keystore)
}

const PASSWORD = 'imToken'
const MNEMONIC = 'inject kidney empty canal shadow pact comfort wife crush horse wife sketch'
const PRIVATE_KEY = 'a392604efc2fad9c0b3da43b5f698a2e3f270f170d859912be0d54742275c5f6'
const ETH_MAINNET_CHAIN_ID = 'eip155:1'
const TRON_MAINNET_CHAIN_ID = 'tron:0x2b6653dc'
const ETH_ACCOUNT_1_DERIVATION_PATH = "m/44'/60'/0'/0/1"
const TRON_ACCOUNT_1_DERIVATION_PATH = "m/44'/195'/0'/0/1"

function withTempVault(run: (tempDir: string) => void) {
  const tempDir = mkdtempSync(join(tmpdir(), 'tcx-core-wallet-'))
  try {
    run(tempDir)
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

function stripHexPrefix(value: string): string {
  return value.startsWith('0x') || value.startsWith('0X') ? value.slice(2) : value
}

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.length % 2 === 0 ? hex : `0${hex}`
  return Uint8Array.from(Buffer.from(normalized, 'hex'))
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const merged = new Uint8Array(total)
  let offset = 0

  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.length
  }

  return merged
}

function encodeRlpBytes(bytes: Uint8Array): Uint8Array {
  if (bytes.length === 1 && bytes[0]! < 0x80) {
    return bytes
  }

  if (bytes.length <= 55) {
    return concatBytes([Uint8Array.of(0x80 + bytes.length), bytes])
  }

  const lengthBytes = hexToBytes(bytes.length.toString(16))
  return concatBytes([Uint8Array.of(0xb7 + lengthBytes.length), lengthBytes, bytes])
}

function encodeRlpList(items: Uint8Array[]): Uint8Array {
  const payload = concatBytes(items)
  if (payload.length <= 55) {
    return concatBytes([Uint8Array.of(0xc0 + payload.length), payload])
  }

  const lengthBytes = hexToBytes(payload.length.toString(16))
  return concatBytes([Uint8Array.of(0xf7 + lengthBytes.length), lengthBytes, payload])
}

function encodeInteger(value: string): Uint8Array {
  if (!value) {
    return new Uint8Array()
  }

  const hex = value.startsWith('0x') || value.startsWith('0X') ? stripHexPrefix(value) : BigInt(value).toString(16)
  if (!hex || /^0+$/.test(hex)) {
    return new Uint8Array()
  }

  return hexToBytes(hex)
}

function encodeHexField(value: string): Uint8Array {
  if (!value) {
    return new Uint8Array()
  }

  return hexToBytes(stripHexPrefix(value))
}

function buildUnsignedLegacyEthTxHex(input: {
  nonce: string
  gasPrice: string
  gasLimit: string
  to: string
  value: string
  data: string
  chainId: string
}): string {
  return Buffer.from(
    encodeRlpList([
      encodeRlpBytes(encodeInteger(input.nonce)),
      encodeRlpBytes(encodeInteger(input.gasPrice)),
      encodeRlpBytes(encodeInteger(input.gasLimit)),
      encodeRlpBytes(encodeHexField(input.to)),
      encodeRlpBytes(encodeInteger(input.value)),
      encodeRlpBytes(encodeHexField(input.data)),
      encodeRlpBytes(encodeInteger(input.chainId)),
      encodeRlpBytes(new Uint8Array()),
      encodeRlpBytes(new Uint8Array()),
    ]),
  ).toString('hex')
}

test('createWallet returns keystore json and default accounts', () => {
  withTempVault((tempDir) => {
    const wallet = createWallet('Created', PASSWORD, tempDir)

    expect(wallet).not.toHaveProperty('mnemonic')
    expect(wallet.meta.source).toBe('NEW_MNEMONIC')
    expect(wallet.meta.network).toBe('MAINNET')
    expect(wallet.meta.derivable).toBe(true)
    expect(wallet.accounts).toHaveLength(2)
    expect(wallet.accounts.map((account) => account.chainId)).toEqual([ETH_MAINNET_CHAIN_ID, TRON_MAINNET_CHAIN_ID])
    expect(wallet.keystore.version).toBe(12000)
  })
})

test('createWallet persists WalletInfo when vaultPath is provided', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'tcx-core-wallet-'))
  try {
    const wallet = createWallet('Created', PASSWORD, tempDir)
    const walletPath = join(tempDir, 'wallets', `${wallet.meta.id}.json`)
    const persisted = JSON.parse(readFileSync(walletPath, 'utf-8')) as WalletInfo

    expect(existsSync(walletPath)).toBe(true)
    expect(persisted).not.toHaveProperty('mnemonic')
    expect(persisted.keystore.id).toBe(wallet.keystore.id)
    expect(persisted.keystore.version).toBe(wallet.keystore.version)
    expect(persisted.meta.id).toBe(wallet.meta.id)
    expect(persisted.meta.source).toBe(wallet.meta.source)
    expect(persisted.accounts.map((account) => account.chainId)).toEqual(
      wallet.accounts.map((account) => account.chainId),
    )
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
})

test('importWalletMnemonic returns default accounts', () => {
  withTempVault((tempDir) => {
    const wallet = importWalletMnemonic('Imported Mnemonic', MNEMONIC, PASSWORD, tempDir)

    expect(wallet).not.toHaveProperty('mnemonic')
    expect(wallet.meta.source).toBe('MNEMONIC')
    expect(wallet.accounts).toHaveLength(2)
    expect(wallet.accounts.map((account) => account.chainId)).toEqual([ETH_MAINNET_CHAIN_ID, TRON_MAINNET_CHAIN_ID])
  })
})

test('importWalletMnemonic derives the requested default account index and persists WalletInfo', () => {
  withTempVault((tempDir) => {
    const defaultWallet = importWalletMnemonic('Default Mnemonic', MNEMONIC, PASSWORD, join(tempDir, 'default'))
    const indexedWallet = importWalletMnemonic('Indexed Mnemonic', MNEMONIC, PASSWORD, tempDir, 1)
    const walletPath = join(tempDir, 'wallets', `${indexedWallet.meta.id}.json`)
    const persisted = JSON.parse(readFileSync(walletPath, 'utf-8')) as WalletInfo

    expect(indexedWallet.accounts.map((account) => account.derivationPath)).toEqual([
      ETH_ACCOUNT_1_DERIVATION_PATH,
      TRON_ACCOUNT_1_DERIVATION_PATH,
    ])
    expect(indexedWallet.accounts[0]?.address).not.toBe(defaultWallet.accounts[0]?.address)
    expect(persisted.keystore).toEqual(indexedWallet.keystore)
    expect(persisted.accounts.map((account) => account.derivationPath)).toEqual([
      ETH_ACCOUNT_1_DERIVATION_PATH,
      TRON_ACCOUNT_1_DERIVATION_PATH,
    ])
  })
})

test('importWalletPrivateKey returns a non-derivable wallet', () => {
  withTempVault((tempDir) => {
    const wallet = importWalletPrivateKey('Imported Private Key', PRIVATE_KEY, PASSWORD, tempDir)

    expect(wallet).not.toHaveProperty('mnemonic')
    expect(wallet.meta.source).toBe('PRIVATE')
    expect(wallet.meta.derivable).toBe(false)
    expect(wallet.accounts).toHaveLength(2)
    expect(wallet.accounts.map((account) => account.chainId)).toEqual([ETH_MAINNET_CHAIN_ID, TRON_MAINNET_CHAIN_ID])
    expect(wallet.accounts[0]?.derivationPath).toBe('')
    expect(wallet.accounts[1]?.derivationPath).toBe('')
    expect(wallet.accounts[0]).not.toHaveProperty('extPubKey')
    expect(wallet.accounts[0]).not.toHaveProperty('publicKey')
    expect(wallet.meta.curve).toBe('secp256k1')
  })
})

test('importWalletPrivateKey persists WalletInfo and ignores index for non-derivable wallets', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'tcx-core-wallet-'))
  try {
    const wallet = importWalletPrivateKey('Imported Private Key', PRIVATE_KEY, PASSWORD, tempDir, 9)
    const walletPath = join(tempDir, 'wallets', `${wallet.meta.id}.json`)
    const persisted = JSON.parse(readFileSync(walletPath, 'utf-8')) as WalletInfo

    expect(wallet.meta.derivable).toBe(false)
    expect(wallet.accounts[0]?.derivationPath).toBe('')
    expect(wallet.accounts[1]?.derivationPath).toBe('')
    expect(wallet.accounts[0]).not.toHaveProperty('extPubKey')
    expect(wallet.accounts[0]).not.toHaveProperty('publicKey')
    expect(persisted.keystore.id).toBe(wallet.keystore.id)
    expect(persisted.keystore.version).toBe(wallet.keystore.version)
    expect(persisted.accounts[0]?.derivationPath).toBe('')
    expect(persisted.accounts[1]?.derivationPath).toBe('')
    expect(persisted.accounts[0]).not.toHaveProperty('extPubKey')
    expect(persisted.accounts[0]).not.toHaveProperty('publicKey')
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
})

test('loadWallet restores keystore json and derives requested accounts', () => {
  withTempVault((tempDir) => {
    const sourceWallet = importWalletMnemonic('Imported Mnemonic', MNEMONIC, PASSWORD, tempDir)

    const wallet = loadWallet(keystoreToJson(sourceWallet.keystore), PASSWORD, [
      {
        chainId: ETH_MAINNET_CHAIN_ID,
        derivationPath: "m/44'/60'/0'/0/1",
      },
    ])

    expect(wallet).not.toHaveProperty('mnemonic')
    expect(wallet.meta.source).toBe('MNEMONIC')
    expect(wallet.accounts).toHaveLength(1)
    expect(wallet.accounts[0]?.derivationPath).toBe("m/44'/60'/0'/0/1")
  })
})

test('importWalletKeystore renames and persists imported keystores', () => {
  withTempVault((tempDir) => {
    const sourceWallet = importWalletMnemonic('Source Wallet', MNEMONIC, PASSWORD, join(tempDir, 'source'))
    const wallet = importWalletKeystore('Imported Keystore', keystoreToJson(sourceWallet.keystore), PASSWORD, tempDir)
    const walletPath = join(tempDir, 'wallets', `${wallet.meta.id}.json`)
    const persisted = JSON.parse(readFileSync(walletPath, 'utf-8')) as WalletInfo

    expect(wallet.meta.name).toBe('Imported Keystore')
    expect(wallet.keystore.imTokenMeta.name).toBe('Imported Keystore')
    expect(wallet.accounts.map((account) => account.chainId)).toEqual([ETH_MAINNET_CHAIN_ID, TRON_MAINNET_CHAIN_ID])
    expect(persisted.meta.name).toBe('Imported Keystore')
    expect(persisted.keystore.imTokenMeta.name).toBe('Imported Keystore')
  })
})

test('deriveAccounts batches arbitrary derivations through a single unlock flow', () => {
  withTempVault((tempDir) => {
    const sourceWallet = importWalletMnemonic('Imported Mnemonic', MNEMONIC, PASSWORD, tempDir)

    const accounts = deriveAccounts(keystoreToJson(sourceWallet.keystore), PASSWORD, [
      {
        chainId: ETH_MAINNET_CHAIN_ID,
        derivationPath: "m/44'/60'/0'/0/0",
      },
      {
        chainId: ETH_MAINNET_CHAIN_ID,
        derivationPath: "m/44'/60'/0'/0/1",
      },
      {
        chainId: TRON_MAINNET_CHAIN_ID,
      },
    ])

    expect(accounts).toHaveLength(3)
    expect(accounts[0]?.derivationPath).toBe("m/44'/60'/0'/0/0")
    expect(accounts[1]?.derivationPath).toBe("m/44'/60'/0'/0/1")
    expect(accounts[2]?.chainId).toBe(TRON_MAINNET_CHAIN_ID)
    expect(accounts[0]?.address).not.toBe(accounts[1]?.address)
  })
})

test('getWallet resolves wallets by exact name and unique id prefix', () => {
  withTempVault((tempDir) => {
    const walletByName = createWallet('Wallet By Name', PASSWORD, tempDir)
    const walletByPrefix = importWalletMnemonic('Wallet By Prefix', MNEMONIC, PASSWORD, tempDir)

    const loadedByName = getWallet('Wallet By Name', tempDir)
    const loadedByPrefix = getWallet(walletByPrefix.meta.id.slice(0, 8), tempDir)

    expect(loadedByName.meta.id).toBe(walletByName.meta.id)
    expect(loadedByPrefix.meta.id).toBe(walletByPrefix.meta.id)
  })
})

test('createWallet rejects duplicate wallet names', () => {
  withTempVault((tempDir) => {
    createWallet('Duplicate', PASSWORD, tempDir)

    expect(() => createWallet('Duplicate', PASSWORD, tempDir)).toThrow(/Wallet `Duplicate` already exists/)
    expect(listWallet(tempDir)).toHaveLength(1)
  })
})

test('importWalletMnemonic rejects duplicate wallet names', () => {
  withTempVault((tempDir) => {
    createWallet('Duplicate', PASSWORD, tempDir)

    expect(() => importWalletMnemonic('Duplicate', MNEMONIC, PASSWORD, tempDir)).toThrow(
      /Wallet `Duplicate` already exists/,
    )
    expect(listWallet(tempDir)).toHaveLength(1)
  })
})

test('importWalletPrivateKey rejects duplicate wallet names', () => {
  withTempVault((tempDir) => {
    createWallet('Duplicate', PASSWORD, tempDir)

    expect(() => importWalletPrivateKey('Duplicate', PRIVATE_KEY, PASSWORD, tempDir)).toThrow(
      /Wallet `Duplicate` already exists/,
    )
    expect(listWallet(tempDir)).toHaveLength(1)
  })
})

test('getWallet rejects ambiguous wallet names', () => {
  withTempVault((tempDir) => {
    // Create first wallet
    const wallet1 = createWallet('Duplicate', PASSWORD, tempDir)

    // Manually create a second wallet file with the same name (simulating manual file copy)
    const wallet2Data = JSON.parse(readFileSync(join(tempDir, 'wallets', `${wallet1.meta.id}.json`), 'utf-8'))
    wallet2Data.meta.id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' // Different ID
    writeFileSync(join(tempDir, 'wallets', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.json'), JSON.stringify(wallet2Data))

    expect(() => getWallet('Duplicate', tempDir)).toThrow(/Multiple wallets share the name "Duplicate"/)
    expect(listWallet(tempDir)).toHaveLength(2)
  })
})

test('signMessage signs Ethereum personal messages', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'tcx-core-wallet-'))
  try {
    importWalletMnemonic('Imported Mnemonic', MNEMONIC, PASSWORD, tempDir)

    const signed = signMessage('Imported Mnemonic', ETH_MAINNET_CHAIN_ID, 'hello world', PASSWORD, tempDir)

    expect(signed.signature).toBe(
      '0x521d0e4b5808b7fbeb53bf1b17c7c6d60432f5b13b7aa3aaed963a894c3bd99e23a3755ec06fa7a61b031192fb5fab6256e180e086c2671e0a574779bb8593df1b',
    )
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
})

test('signMessage signs Tron messages with default options', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'tcx-core-wallet-'))
  try {
    importWalletMnemonic('Imported Mnemonic', MNEMONIC, PASSWORD, tempDir)

    const signed = signMessage('Imported Mnemonic', TRON_MAINNET_CHAIN_ID, 'hello world', PASSWORD, tempDir)

    expect(signed.signature).toBe(
      '0x8686cc3cf49e772d96d3a8147a59eb3df2659c172775f3611648bfbe7e3c48c11859b873d9d2185567a4f64a14fa38ce78dc385a7364af55109c5b6426e4c0f61b',
    )
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
})

test('signTransaction signs Ethereum transactions', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'tcx-core-wallet-'))
  try {
    importWalletPrivateKey('Imported Private Key', PRIVATE_KEY, PASSWORD, tempDir)

    const txHex = buildUnsignedLegacyEthTxHex({
      nonce: '8',
      gasPrice: '20000000008',
      gasLimit: '189000',
      to: '0x3535353535353535353535353535353535353535',
      value: '512',
      data: '',
      chainId: '0x38',
    })

    const signed = signTransaction('Imported Private Key', 'eip155:56', txHex, PASSWORD, tempDir)

    expect(signed.signature).toBe(
      'f868088504a817c8088302e248943535353535353535353535353535353535353535820200808194a003479f1d6be72af58b1d60750e155c435e435726b5b690f4d3e59f34bd55e578a0314d2b03d29dc3f87ff95c3427658952add3cf718d3b6b8604068fc3105e4442',
    )
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
})

test('listWallet returns empty array when vault directory does not exist', () => {
  withTempVault((tempDir) => {
    const wallets = listWallet(join(tempDir, 'missing'))
    expect(wallets).toEqual([])
  })
})

test('listWallet returns persisted wallets from vault directory', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'tcx-core-wallet-'))
  try {
    const wallet1 = createWallet('Wallet 1', PASSWORD, tempDir)
    const wallet2 = importWalletMnemonic('Wallet 2', MNEMONIC, PASSWORD, tempDir)

    const wallets = listWallet(tempDir)

    expect(wallets).toHaveLength(2)
    expect(wallets.map((w) => w.meta.id).sort()).toEqual([wallet1.meta.id, wallet2.meta.id].sort())
    expect(wallets[0]?.meta.name).toBeDefined()
    expect(wallets[0]?.keystore).toBeDefined()
    expect(wallets[0]?.accounts).toBeDefined()
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
})

test('deleteWallet removes wallets by exact name and unique id prefix', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'tcx-core-wallet-'))
  try {
    const walletByName = createWallet('Wallet By Name', PASSWORD, tempDir)
    const walletByPrefix = importWalletMnemonic('Wallet By Prefix', MNEMONIC, PASSWORD, tempDir)

    deleteWallet('Wallet By Name', tempDir)
    expect(existsSync(join(tempDir, 'wallets', `${walletByName.meta.id}.json`))).toBe(false)

    deleteWallet(walletByPrefix.meta.id.slice(0, 8), tempDir)
    expect(existsSync(join(tempDir, 'wallets', `${walletByPrefix.meta.id}.json`))).toBe(false)
    expect(listWallet(tempDir)).toEqual([])
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
})

test('deleteWallet rejects ambiguous wallet names', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'tcx-core-wallet-'))
  try {
    // Create first wallet
    const wallet1 = createWallet('Duplicate', PASSWORD, tempDir)

    // Manually create a second wallet file with the same name (simulating manual file copy)
    const wallet2Data = JSON.parse(readFileSync(join(tempDir, 'wallets', `${wallet1.meta.id}.json`), 'utf-8'))
    wallet2Data.meta.id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' // Different ID
    writeFileSync(join(tempDir, 'wallets', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.json'), JSON.stringify(wallet2Data))

    expect(() => deleteWallet('Duplicate', tempDir)).toThrow(/Multiple wallets share the name "Duplicate"/)
    expect(listWallet(tempDir)).toHaveLength(2)
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
})

test('signTransaction signs Tron transactions', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'tcx-core-wallet-'))
  try {
    importWalletMnemonic('Imported Mnemonic', MNEMONIC, PASSWORD, tempDir)

    const signed = signTransaction(
      'Imported Mnemonic',
      TRON_MAINNET_CHAIN_ID,
      '0a0208312208b02efdc02638b61e40f083c3a7c92d5a65080112610a2d747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e5472616e73666572436f6e747261637412300a1541a1e81654258bf14f63feb2e8d1380075d45b0dac1215410b3e84ec677b3e63c99affcadb91a6b4e086798f186470a0bfbfa7c92d',
      PASSWORD,
      tempDir,
    )

    expect(signed.signature).toBe(
      'c65b4bde808f7fcfab7b0ef9c1e3946c83311f8ac0a5e95be2d8b6d2400cfe8b5e24dc8f0883132513e422f2aaad8a4ecc14438eae84b2683eefa626e3adffc601',
    )
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
})

test('createApiKey and signTransaction reuse the original signing entrypoints', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'tcx-core-wallet-'))
  try {
    importWalletPrivateKey('Agent Signer', PRIVATE_KEY, PASSWORD, tempDir)

    const policy = createPolicy(
      {
        name: 'BSC only',
        rules: [
          {
            type: 'allowed_chains',
            chainIds: ['eip155:56'],
          },
        ],
      },
      tempDir,
    )

    const created = createApiKey('agent', ['Agent Signer'], [policy.id], PASSWORD, undefined, tempDir)

    expect(created.token.startsWith(`bulu_key_${created.apiKey.id}_`)).toBe(true)
    expect(readFileSync(join(tempDir, 'keys', `${created.apiKey.id}.json`), 'utf-8')).not.toContain(created.token)

    const txHex = buildUnsignedLegacyEthTxHex({
      nonce: '8',
      gasPrice: '20000000008',
      gasLimit: '189000',
      to: '0x3535353535353535353535353535353535353535',
      value: '512',
      data: '',
      chainId: '0x38',
    })

    const signed = signTransaction('Agent Signer', 'eip155:56', txHex, created.token, tempDir)
    expect(signed.signature).toBeDefined()

    revokeApiKey(created.apiKey.id, tempDir)
    expect(() => signTransaction('Agent Signer', 'eip155:56', txHex, created.token, tempDir)).toThrow(
      /credential is invalid/,
    )
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
})
