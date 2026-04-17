# @bulu-cli/tcx-core

`@bulu-cli/tcx-core` is a Rust-powered N-API package for Ethereum and Tron wallet management used by the bulu CLI.

## Install

```bash
pnpm add @bulu-cli/tcx-core
```

## Usage

```ts
import { createWallet, listWallet } from '@bulu-cli/tcx-core'

const vaultPath = '.bulu'
createWallet('main', 'password', vaultPath)

const wallets = listWallet(vaultPath)
console.log(wallets)
```

## Features

- Create wallets from new mnemonics, existing mnemonics, private keys, or keystore JSON
- Load, list, and delete persisted wallets in a vault directory
- Derive accounts and sign Ethereum or Tron messages and transactions
- Create declarative signing policies and API keys for agent-mode access

## Agent Mode

```ts
import { createApiKey, createPolicy, signTransaction } from '@bulu-cli/tcx-core'

const policy = createPolicy(
  {
    name: 'BSC only',
    rules: [{ type: 'allowed_chains', chainIds: ['eip155:56'] }],
  },
  '.bulu',
)

const created = createApiKey('agent', ['main'], [policy.id], 'wallet-passphrase', undefined, '.bulu')

const signed = signTransaction('main', 'eip155:56', '<unsigned-tx-hex>', created.token, '.bulu')
```

You can also restrict typed data (EIP-712) signatures by `primaryType` and `domain.verifyingContract`:

```ts
const typedDataPolicy = createPolicy(
  {
    name: 'USDC Permit only',
    rules: [
      { type: 'allowed_primary_types', primaryTypes: ['Permit'] },
      {
        type: 'allowed_verifying_contracts',
        verifyingContracts: ['0xA0b86a33E6Cb19d3C91d8C8c3D0f1E62b68DEf98'],
      },
    ],
  },
  '.bulu',
)

const agent = createApiKey('permit-agent', ['main'], [typedDataPolicy.id], 'wallet-passphrase', undefined, '.bulu')

const signed = signTypedData('main', 'eip155:1', '<typed-data-json>', agent.token, '.bulu')
```
