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
