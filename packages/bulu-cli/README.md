# @bulu-cli/core

`bulu` is a local blockchain wallet management CLI tool. It supports creating, importing, signing, and policy-based authorization for Ethereum, Tron, and Bitcoin wallets.

## Capabilities

- **Multi-chain wallet management** — Create, import, export, and delete Ethereum / Tron / Bitcoin wallets. All key material is encrypted and stored in a local vault.
- **Message & transaction signing** — Sign messages and transactions locally without uploading private keys to remote services.
- **Agent mode** — Create revocable API keys and declarative signing policies (allowed chains, expiry, permission scopes) for secure automated/scripted signing.
- **Configuration management** — Initialize and manage local CLI settings, including a customizable vault directory.

## Install

```bash
pnpm add -g @bulu-cli/core
```

> Requires Node.js >= 24.0.0.

## Quick Start

```bash
# Initialize configuration
bulu config init

# Create a new wallet
bulu wallet create

# Import an existing wallet
bulu wallet import

# List local wallets
bulu wallet list

# Show wallet details
bulu wallet info <wallet>

# Export wallet (mnemonic / private key)
bulu wallet export <wallet>

# Delete a local wallet
bulu wallet delete <wallet>
```

## Command Overview

| Command                       | Description                                  |
| ----------------------------- | -------------------------------------------- |
| `bulu config init`            | Initialize the CLI configuration file        |
| `bulu wallet create`          | Create a new wallet                          |
| `bulu wallet import`          | Import a wallet from mnemonic or private key |
| `bulu wallet list`            | List all local wallets                       |
| `bulu wallet info <wallet>`   | View wallet metadata                         |
| `bulu wallet export <wallet>` | Export wallet keys                           |
| `bulu wallet delete <wallet>` | Delete a local wallet                        |
| `bulu sign message`           | Sign a message                               |
| `bulu sign transaction`       | Sign a transaction                           |

## Security Notes

- **Passphrases** and **API keys** are resolved via the environment variables `BULU_PASSPHRASE` / `TCX_PASSPHRASE` or `BULU_APIKEY` / `TCX_APIKEY`, or through an interactive prompt. They are **never persisted to disk**.
- Wallet keys are stored in encrypted form inside `~/.bulu/vault/` (configurable). Raw private keys are never kept in plaintext in the vault.
