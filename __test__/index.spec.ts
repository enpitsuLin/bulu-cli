import { expect, test } from 'vitest'

import { createWallet, importWalletMnemonic, importWalletPrivateKey } from '../index'

const PASSWORD = 'imToken'
const MNEMONIC = 'inject kidney empty canal shadow pact comfort wife crush horse wife sketch'
const PRIVATE_KEY = 'a392604efc2fad9c0b3da43b5f698a2e3f270f170d859912be0d54742275c5f6'

test('createWallet returns a standard HD keystore', () => {
  const wallet = createWallet({
    password: PASSWORD,
    name: 'Created',
    passwordHint: 'hint',
    network: 'TESTNET',
    entropy: '000102030405060708090a0b0c0d0e0f',
  })

  expect(wallet.source).toBe('NEW_MNEMONIC')
  expect(wallet.network).toBe('TESTNET')
  expect(wallet.mnemonic).toBeTruthy()
  expect(wallet.accounts).toHaveLength(2)
  expect(
    wallet.accounts.map((account) => account.chain),
  ).toEqual(['ETHEREUM', 'TRON'])
  expect(wallet.keystoreJson).toBeTruthy()
})

test('importWalletMnemonic returns a standard mnemonic keystore', () => {
  const wallet = importWalletMnemonic({
    mnemonic: MNEMONIC,
    password: PASSWORD,
    name: 'Imported Mnemonic',
  })

  expect(wallet.source).toBe('MNEMONIC')
  expect(wallet.network).toBe('MAINNET')
  expect(wallet.accounts[0]?.derivationPath).toBe("m/44'/60'/0'/0/0")
  expect(wallet.accounts[1]?.derivationPath).toBe("m/44'/195'/0'/0/0")
  expect(wallet.mnemonic).toBeFalsy()
})

test('importWalletPrivateKey returns a standard private keystore', () => {
  const wallet = importWalletPrivateKey({
    privateKey: PRIVATE_KEY,
    password: PASSWORD,
    name: 'Imported Private Key',
  })

  expect(wallet.source).toBe('PRIVATE')
  expect(wallet.accounts).toHaveLength(2)
  expect(
    wallet.accounts.every((account) => account.derivationPath === undefined),
  ).toBe(true)
  expect(wallet.keystoreJson).toBeTruthy()
})
