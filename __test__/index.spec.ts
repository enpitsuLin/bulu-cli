import test from 'ava'

import { createWallet, importWalletMnemonic, importWalletPrivateKey } from '../index'

const PASSWORD = 'imToken'
const MNEMONIC = 'inject kidney empty canal shadow pact comfort wife crush horse wife sketch'
const PRIVATE_KEY = 'a392604efc2fad9c0b3da43b5f698a2e3f270f170d859912be0d54742275c5f6'

test('createWallet returns a standard HD keystore', (t) => {
  const wallet = createWallet({
    password: PASSWORD,
    name: 'Created',
    passwordHint: 'hint',
    network: 'TESTNET',
    entropy: '000102030405060708090a0b0c0d0e0f',
  })

  t.is(wallet.source, 'NEW_MNEMONIC')
  t.is(wallet.network, 'TESTNET')
  t.truthy(wallet.mnemonic)
  t.is(wallet.accounts.length, 2)
  t.deepEqual(
    wallet.accounts.map((account) => account.chain),
    ['ETHEREUM', 'TRON'],
  )
  t.truthy(wallet.keystoreJson)
})

test('importWalletMnemonic returns a standard mnemonic keystore', (t) => {
  const wallet = importWalletMnemonic({
    mnemonic: MNEMONIC,
    password: PASSWORD,
    name: 'Imported Mnemonic',
  })

  t.is(wallet.source, 'MNEMONIC')
  t.is(wallet.network, 'MAINNET')
  t.is(wallet.accounts[0]?.derivationPath, "m/44'/60'/0'/0/0")
  t.is(wallet.accounts[1]?.derivationPath, "m/44'/195'/0'/0/0")
  t.falsy(wallet.mnemonic)
})

test('importWalletPrivateKey returns a standard private keystore', (t) => {
  const wallet = importWalletPrivateKey({
    privateKey: PRIVATE_KEY,
    password: PASSWORD,
    name: 'Imported Private Key',
  })

  t.is(wallet.source, 'PRIVATE')
  t.is(wallet.accounts.length, 2)
  t.true(wallet.accounts.every((account) => account.derivationPath === undefined))
  t.truthy(wallet.keystoreJson)
})
