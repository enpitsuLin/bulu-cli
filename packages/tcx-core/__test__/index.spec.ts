import { expect, test } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  type WalletInfo,
  WalletNetwork,
  WalletSource,
  createWallet,
  deriveAccounts,
  importWalletMnemonic,
  importWalletPrivateKey,
  listWallet,
  loadWallet,
  signMessage,
  signTransaction,
} from '../index'
import { Buffer } from 'node:buffer'

const PASSWORD = 'imToken'
const MNEMONIC = 'inject kidney empty canal shadow pact comfort wife crush horse wife sketch'
const PRIVATE_KEY = 'a392604efc2fad9c0b3da43b5f698a2e3f270f170d859912be0d54742275c5f6'
const ETH_MAINNET_CHAIN_ID = 'eip155:1'
const TRON_MAINNET_CHAIN_ID = 'tron:0x2b6653dc'
const ETH_ACCOUNT_1_DERIVATION_PATH = "m/44'/60'/0'/0/1"
const TRON_ACCOUNT_1_DERIVATION_PATH = "m/44'/195'/0'/0/1"

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
  const wallet = createWallet('Created', PASSWORD)

  expect(wallet).not.toHaveProperty('mnemonic')
  expect(wallet.meta.source).toBe(WalletSource.NewMnemonic)
  expect(wallet.meta.network).toBe(WalletNetwork.Mainnet)
  expect(wallet.meta.derivable).toBe(true)
  expect(wallet.accounts).toHaveLength(2)
  expect(wallet.accounts.map((account) => account.chainId)).toEqual([ETH_MAINNET_CHAIN_ID, TRON_MAINNET_CHAIN_ID])
  expect(wallet.keystoreJson).toContain('"version":12000')
})

test('createWallet persists WalletInfo when vaultPath is provided', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'tcx-core-wallet-'))
  try {
    const wallet = createWallet('Created', PASSWORD, tempDir)
    const walletPath = join(tempDir, 'wallets', `${wallet.meta.id}.json`)
    const persisted = JSON.parse(readFileSync(walletPath, 'utf-8')) as WalletInfo

    expect(existsSync(walletPath)).toBe(true)
    expect(persisted).not.toHaveProperty('mnemonic')
    expect(persisted.keystoreJson).toBe(wallet.keystoreJson)
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
  const wallet = importWalletMnemonic('Imported Mnemonic', MNEMONIC, PASSWORD)

  expect(wallet).not.toHaveProperty('mnemonic')
  expect(wallet.meta.source).toBe(WalletSource.Mnemonic)
  expect(wallet.accounts).toHaveLength(2)
  expect(wallet.accounts.map((account) => account.chainId)).toEqual([ETH_MAINNET_CHAIN_ID, TRON_MAINNET_CHAIN_ID])
})

test('importWalletMnemonic derives the requested default account index and persists WalletInfo', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'tcx-core-wallet-'))
  try {
    const defaultWallet = importWalletMnemonic('Default Mnemonic', MNEMONIC, PASSWORD)
    const indexedWallet = importWalletMnemonic('Indexed Mnemonic', MNEMONIC, PASSWORD, tempDir, 1)
    const walletPath = join(tempDir, 'wallets', `${indexedWallet.meta.id}.json`)
    const persisted = JSON.parse(readFileSync(walletPath, 'utf-8')) as WalletInfo

    expect(indexedWallet.accounts.map((account) => account.derivationPath)).toEqual([
      ETH_ACCOUNT_1_DERIVATION_PATH,
      TRON_ACCOUNT_1_DERIVATION_PATH,
    ])
    expect(indexedWallet.accounts[0]?.address).not.toBe(defaultWallet.accounts[0]?.address)
    expect(persisted.keystoreJson).toBe(indexedWallet.keystoreJson)
    expect(persisted.accounts.map((account) => account.derivationPath)).toEqual([
      ETH_ACCOUNT_1_DERIVATION_PATH,
      TRON_ACCOUNT_1_DERIVATION_PATH,
    ])
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
})

test('importWalletPrivateKey returns a non-derivable wallet', () => {
  const wallet = importWalletPrivateKey('Imported Private Key', PRIVATE_KEY, PASSWORD)

  expect(wallet).not.toHaveProperty('mnemonic')
  expect(wallet.meta.source).toBe(WalletSource.Private)
  expect(wallet.meta.derivable).toBe(false)
  expect(wallet.accounts).toHaveLength(2)
  expect(wallet.accounts.map((account) => account.chainId)).toEqual([ETH_MAINNET_CHAIN_ID, TRON_MAINNET_CHAIN_ID])
  expect(wallet.accounts[0]?.derivationPath).toBeUndefined()
  expect(wallet.accounts[0]?.extPubKey).toBeUndefined()
  expect(wallet.meta.curve).toBe('secp256k1')
})

test('importWalletPrivateKey persists WalletInfo and ignores index for non-derivable wallets', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'tcx-core-wallet-'))
  try {
    const wallet = importWalletPrivateKey('Imported Private Key', PRIVATE_KEY, PASSWORD, tempDir, 9)
    const walletPath = join(tempDir, `${wallet.meta.id}.json`)
    const persisted = JSON.parse(readFileSync(walletPath, 'utf-8')) as WalletInfo

    expect(wallet.meta.derivable).toBe(false)
    expect(wallet.accounts[0]?.derivationPath).toBeUndefined()
    expect(wallet.accounts[0]?.extPubKey).toBeUndefined()
    expect(persisted.keystoreJson).toBe(wallet.keystoreJson)
    expect(persisted.accounts[0]?.derivationPath).toBeUndefined()
    expect(persisted.accounts[0]?.extPubKey).toBeUndefined()
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
})

test('loadWallet restores keystore json and derives requested accounts', () => {
  const sourceWallet = importWalletMnemonic('Imported Mnemonic', MNEMONIC, PASSWORD)

  const wallet = loadWallet(sourceWallet.keystoreJson, PASSWORD, [
    {
      chainId: ETH_MAINNET_CHAIN_ID,
      derivationPath: "m/44'/60'/0'/0/1",
    },
  ])

  expect(wallet).not.toHaveProperty('mnemonic')
  expect(wallet.meta.source).toBe(WalletSource.Mnemonic)
  expect(wallet.accounts).toHaveLength(1)
  expect(wallet.accounts[0]?.derivationPath).toBe("m/44'/60'/0'/0/1")
})

test('deriveAccounts batches arbitrary derivations through a single unlock flow', () => {
  const sourceWallet = importWalletMnemonic('Imported Mnemonic', MNEMONIC, PASSWORD)

  const accounts = deriveAccounts(sourceWallet.keystoreJson, PASSWORD, [
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

test('signMessage signs Ethereum personal messages', () => {
  const wallet = importWalletMnemonic('Imported Mnemonic', MNEMONIC, PASSWORD)

  const signed = signMessage(wallet.keystoreJson, ETH_MAINNET_CHAIN_ID, 'hello world', PASSWORD)

  expect(signed.signature).toBe(
    '0x521d0e4b5808b7fbeb53bf1b17c7c6d60432f5b13b7aa3aaed963a894c3bd99e23a3755ec06fa7a61b031192fb5fab6256e180e086c2671e0a574779bb8593df1b',
  )
})

test('signMessage signs Tron messages with default options', () => {
  const wallet = importWalletMnemonic('Imported Mnemonic', MNEMONIC, PASSWORD)

  const signed = signMessage(wallet.keystoreJson, TRON_MAINNET_CHAIN_ID, 'hello world', PASSWORD)

  expect(signed.signature).toBe(
    '0x8686cc3cf49e772d96d3a8147a59eb3df2659c172775f3611648bfbe7e3c48c11859b873d9d2185567a4f64a14fa38ce78dc385a7364af55109c5b6426e4c0f61b',
  )
})

test('signTransaction signs Ethereum transactions', () => {
  const wallet = importWalletPrivateKey('Imported Private Key', PRIVATE_KEY, PASSWORD)

  const txHex = buildUnsignedLegacyEthTxHex({
    nonce: '8',
    gasPrice: '20000000008',
    gasLimit: '189000',
    to: '0x3535353535353535353535353535353535353535',
    value: '512',
    data: '',
    chainId: '0x38',
  })

  const signed = signTransaction(wallet.keystoreJson, 'eip155:56', txHex, PASSWORD)

  expect('txHash' in signed).toBe(true)
  if (!('txHash' in signed)) {
    throw new Error('Expected an Ethereum signed transaction result')
  }

  expect(signed.txHash).toBe('0x1a3c3947ea626e00d6ff1493bcf929b9320d15ff088046990ef88a45f7d37623')
  expect(signed.signature).toBe(
    'f868088504a817c8088302e248943535353535353535353535353535353535353535820200808194a003479f1d6be72af58b1d60750e155c435e435726b5b690f4d3e59f34bd55e578a0314d2b03d29dc3f87ff95c3427658952add3cf718d3b6b8604068fc3105e4442',
  )
})

test('listWallet returns empty array when vaultPath is not provided', () => {
  const wallets = listWallet()
  expect(wallets).toEqual([])
})

test('listWallet returns empty array when vaultPath does not exist', () => {
  const wallets = listWallet('/nonexistent/path')
  expect(wallets).toEqual([])
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
    expect(wallets[0]?.keystoreJson).toBeDefined()
    expect(wallets[0]?.accounts).toBeDefined()
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
})

test('signTransaction signs Tron transactions', () => {
  const wallet = importWalletMnemonic('Imported Mnemonic', MNEMONIC, PASSWORD)

  const signed = signTransaction(
    wallet.keystoreJson,
    TRON_MAINNET_CHAIN_ID,
    '0a0208312208b02efdc02638b61e40f083c3a7c92d5a65080112610a2d747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e5472616e73666572436f6e747261637412300a1541a1e81654258bf14f63feb2e8d1380075d45b0dac1215410b3e84ec677b3e63c99affcadb91a6b4e086798f186470a0bfbfa7c92d',
    PASSWORD,
  )

  expect('signatures' in signed).toBe(true)
  if (!('signatures' in signed)) {
    throw new Error('Expected a Tron signed transaction result')
  }

  expect(signed.signatures).toEqual([
    'c65b4bde808f7fcfab7b0ef9c1e3946c83311f8ac0a5e95be2d8b6d2400cfe8b5e24dc8f0883132513e422f2aaad8a4ecc14438eae84b2683eefa626e3adffc601',
  ])
})
