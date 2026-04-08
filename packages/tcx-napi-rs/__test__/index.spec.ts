import { expect, test } from 'vitest'

import {
  WalletNetwork,
  WalletSource,
  createWallet,
  deriveAccounts,
  importWalletMnemonic,
  importWalletPrivateKey,
  loadWallet,
} from '../index'

const PASSWORD = 'imToken'
const MNEMONIC = 'inject kidney empty canal shadow pact comfort wife crush horse wife sketch'
const PRIVATE_KEY = 'a392604efc2fad9c0b3da43b5f698a2e3f270f170d859912be0d54742275c5f6'
const ETH_MAINNET_CHAIN_ID = 'eip155:1'
const ETH_TESTNET_CHAIN_ID = 'eip155:11155111'
const TRON_MAINNET_CHAIN_ID = 'tron:0x2b6653dc'
const TRON_TESTNET_CHAIN_ID = 'tron:0xcd8690dc'

test('createWallet returns mnemonic, keystore json, and default accounts', () => {
  const wallet = createWallet({
    password: PASSWORD,
    name: 'Created',
    passwordHint: 'hint',
    network: WalletNetwork.Testnet,
    entropy: '000102030405060708090a0b0c0d0e0f',
  })

  expect(wallet.meta.source).toBe(WalletSource.NewMnemonic)
  expect(wallet.meta.network).toBe(WalletNetwork.Testnet)
  expect(wallet.meta.derivable).toBe(true)
  expect(wallet.accounts).toHaveLength(2)
  expect(wallet.accounts.map((account) => account.chainId)).toEqual([ETH_TESTNET_CHAIN_ID, TRON_TESTNET_CHAIN_ID])
  expect(wallet.keystoreJson).toContain('"version":12000')
  expect(wallet.mnemonic?.split(/\s+/)).toHaveLength(12)
})

test('importWalletMnemonic supports custom derivations and preserves mnemonic', () => {
  const wallet = importWalletMnemonic({
    mnemonic: MNEMONIC,
    password: PASSWORD,
    name: 'Imported Mnemonic',
    derivations: [
      {
        chainId: TRON_MAINNET_CHAIN_ID,
      },
      {
        chainId: ETH_MAINNET_CHAIN_ID,
        derivationPath: "m/44'/60'/0'/0/1",
      },
    ],
  })

  expect(wallet.meta.source).toBe(WalletSource.Mnemonic)
  expect(wallet.accounts).toHaveLength(2)
  expect(wallet.accounts[0]?.chainId).toBe(TRON_MAINNET_CHAIN_ID)
  expect(wallet.accounts[1]?.derivationPath).toBe("m/44'/60'/0'/0/1")
  expect(wallet.mnemonic).toBe(MNEMONIC)
})

test('importWalletPrivateKey returns a non-derivable wallet', () => {
  const wallet = importWalletPrivateKey({
    privateKey: PRIVATE_KEY,
    password: PASSWORD,
    name: 'Imported Private Key',
    derivations: [
      {
        chainId: TRON_TESTNET_CHAIN_ID,
        derivationPath: "m/44'/195'/0'/0/99",
        network: WalletNetwork.Testnet,
      },
    ],
  })

  expect(wallet.meta.source).toBe(WalletSource.Private)
  expect(wallet.meta.derivable).toBe(false)
  expect(wallet.accounts).toHaveLength(1)
  expect(wallet.accounts[0]?.chainId).toBe(TRON_TESTNET_CHAIN_ID)
  expect(wallet.accounts[0]?.derivationPath).toBeUndefined()
  expect(wallet.accounts[0]?.extPubKey).toBeUndefined()
  expect(wallet.meta.curve).toBe('secp256k1')
  expect(wallet.mnemonic).toBeUndefined()
})

test('loadWallet restores keystore json and derives requested accounts', () => {
  const sourceWallet = importWalletMnemonic({
    mnemonic: MNEMONIC,
    password: PASSWORD,
    name: 'Imported Mnemonic',
  })

  const wallet = loadWallet({
    keystoreJson: sourceWallet.keystoreJson,
    password: PASSWORD,
    derivations: [
      {
        chainId: ETH_MAINNET_CHAIN_ID,
        derivationPath: "m/44'/60'/0'/0/1",
      },
    ],
  })

  expect(wallet.meta.source).toBe(WalletSource.Mnemonic)
  expect(wallet.accounts).toHaveLength(1)
  expect(wallet.accounts[0]?.derivationPath).toBe("m/44'/60'/0'/0/1")
  expect(wallet.mnemonic).toBeUndefined()
})

test('deriveAccounts batches arbitrary derivations through a single unlock flow', () => {
  const sourceWallet = importWalletMnemonic({
    mnemonic: MNEMONIC,
    password: PASSWORD,
    name: 'Imported Mnemonic',
  })

  const accounts = deriveAccounts({
    keystoreJson: sourceWallet.keystoreJson,
    password: PASSWORD,
    derivations: [
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
    ],
  })

  expect(accounts).toHaveLength(3)
  expect(accounts[0]?.derivationPath).toBe("m/44'/60'/0'/0/0")
  expect(accounts[1]?.derivationPath).toBe("m/44'/60'/0'/0/1")
  expect(accounts[2]?.chainId).toBe(TRON_MAINNET_CHAIN_ID)
  expect(accounts[0]?.address).not.toBe(accounts[1]?.address)
})
