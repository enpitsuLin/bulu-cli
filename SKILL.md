---
name: bulu-cli
description: |
  Guide for using the `bulu` blockchain wallet management CLI tool. Use this skill whenever the user is working with local wallet operations, signing transactions or messages, managing Ethereum/Tron/Bitcoin wallets, trading on Hyperliquid spot markets, configuring CLI settings, or setting up agent-mode policies and API keys. This includes any mention of wallet creation, import, export, deletion, address lookup, transaction signing, message signing, typed-data signing (EIP-712), keystore handling, vault management, API key generation, signing policies, or Hyperliquid trading — even if the user does not explicitly mention `bulu` or `bulu-cli`. Also use this skill when the user asks about CLI config, default wallet/chain settings, output formatting, or passphrase/API key resolution.
---

# bulu-cli

`bulu` is a local blockchain wallet management CLI. It stores encrypted key material in a local vault and supports Ethereum, Tron, and Bitcoin wallets. All signing happens locally; private keys never leave the machine.

## When to use this skill

- The user wants to create, import, export, delete, list, or switch wallets.
- The user needs to sign a transaction, message, or typed structured data.
- The user is interacting with Hyperliquid spot markets (placing, canceling, modifying, or listing orders; checking balances or market data).
- The user wants to configure CLI defaults (wallet, chain, output format, RPC endpoints).
- The user is setting up agent-mode signing with API keys and policies.
- The user asks about vault paths, keystores, passphrases, or CAIP-2 chain identifiers.

## Core concepts

### Vault

Wallets and policies are stored as encrypted JSON files in the vault directory. Default: `~/.config/bulu/vault/`. Override with the `BULU_CONFIG_DIR` environment variable.

### Passphrase / API key resolution

Commands that access the vault need a credential. The resolution order is:

1. `TCX_PASSPHRASE` or `BULU_PASSPHRASE` environment variable
2. `TCX_APIKEY` or `BULU_APIKEY` environment variable (agent mode)
3. Interactive password prompt (falls back if no env var is set)

**Recommendation**: In scripts or automated environments, always set the passphrase via environment variable rather than typing interactively.

### CAIP-2 chain identifiers

Chain IDs follow the CAIP-2 format. Common values:

| Chain            | CAIP-2 ID                                 |
| ---------------- | ----------------------------------------- |
| Ethereum mainnet | `eip155:1`                                |
| Ethereum Sepolia | `eip155:11155111`                         |
| Tron mainnet     | `tron:0x2b6653dc`                         |
| Bitcoin mainnet  | `bip122:000000000019d6689c085ae165831e93` |

### Default wallet and chain

`bulu` respects config defaults. If a command accepts `--wallet` and it is omitted, the CLI falls back to `config.default.wallet`. Set it with:

```bash
bulu config set default.wallet my-wallet
```

## Command reference

### Wallet management (`bulu wallet <subcommand>`)

| Subcommand                 | Description                                    | Key flags                                                     |
| -------------------------- | ---------------------------------------------- | ------------------------------------------------------------- |
| `create <name>`            | Create a new mnemonic-based wallet             | —                                                             |
| `import <name> [key]`      | Import from private key, mnemonic, or keystore | `--mnemonic`, `--keystore`, `--file <path>`, `--index <n>`    |
| `export <wallet>`          | Export mnemonic or private key                 | `--confirm` **(required)**                                    |
| `export-keystore <wallet>` | Export Ethereum keystore V3 JSON               | `--confirm`, `--keystorePassword <pwd>`, `--qr`               |
| `info <wallet>`            | Show wallet metadata and accounts              | —                                                             |
| `list`                     | List all wallets with active indicator         | —                                                             |
| `delete <name>`            | Delete a wallet from the vault                 | `--confirm` **(required)**                                    |
| `switch <name>`            | Set the active default wallet                  | —                                                             |
| `key create <name>`        | Create an API key for agent-mode signing       | `--wallet <names>`, `--policy <names>`, `--expires-at <unix>` |
| `key list`                 | List API keys                                  | —                                                             |
| `key revoke <name>`        | Revoke an API key                              | `--confirm` **(required)**                                    |
| `policy create <file>`     | Create a signing policy from a JSON file       | —                                                             |
| `policy list`              | List signing policies                          | —                                                             |

**Import behavior**:

- If the positional `key` looks like a mnemonic (12+ space-separated words), it imports as a mnemonic.
- Otherwise it imports as a private key.
- Use `--mnemonic` or `--keystore` for interactive prompts.
- `--index` sets the default derivation account index for mnemonic imports.

**Security note for export/delete/revoke**: These commands require `--confirm` to proceed. If omitted, the CLI prints a warning and exits with code 1. Do not suggest running them without `--confirm`.

### Signing (`bulu sign <subcommand>`)

| Subcommand          | Description                       | Required args                           |
| ------------------- | --------------------------------- | --------------------------------------- |
| `tx <txHex>`        | Sign a raw transaction            | `--wallet <name>`, `--chain-id <caip2>` |
| `message <msg>`     | Sign a plain message              | `--wallet <name>`, `--chain-id <caip2>` |
| `typed-data <json>` | Sign EIP-712 / TIP-712 typed data | `--wallet <name>`, `--chain-id <caip2>` |

The output is JSON containing the `signature` field.

### Configuration (`bulu config <subcommand>`)

| Subcommand          | Description                     | Example                                  |
| ------------------- | ------------------------------- | ---------------------------------------- |
| `get <key>`         | Read a config value by dot path | `bulu config get default.wallet`         |
| `set <key> <value>` | Write a config value            | `bulu config set default.chain eip155:1` |
| `list`              | Show the full merged config     | —                                        |

Config keys use dot notation (e.g., `default.wallet`, `chains.eip155:1.rpc`, `hyperliquid.retry`).

### Hyperliquid spot trading (`bulu spot <subcommand>`)

All spot commands accept `--testnet` to target the Hyperliquid testnet.

| Subcommand                           | Description                            | Key flags                                                      |
| ------------------------------------ | -------------------------------------- | -------------------------------------------------------------- | ----------------------------------- | --- | ------------------------------------------- |
| `markets [market]`                   | List spot markets and price context    | —                                                              |
| `balances`                           | Show spot balances                     | `--wallet <name>`                                              |
| `order place <market> <side> <size>` | Place a limit or market order          | `--wallet <name>`, `--type limit                               | market`, `--price <px>`, `--tif gtc | ioc | alo`, `--slippage <ratio>`, `--cloid <hex>` |
| `order list [market]`                | List open orders                       | `--wallet <name>`                                              |
| `order cancel <market> <id>`         | Cancel an order by oid or cloid        | `--wallet <name>`, `--cloid`                                   |
| `order modify <market> <id>`         | Modify price, size, or TIF of an order | `--wallet <name>`, `--price <px>`, `--size <n>`, `--tif <val>` |
| `order status <id>`                  | Query order status by oid or cloid     | `--wallet <name>`                                              |

**Order side normalization**: `buy`, `bid`, `b` → buy; `sell`, `ask`, `a` → sell.

**Market orders**: Do not pass `--price`. The CLI fetches the current mid price and applies slippage (default 3%). Market orders are always IOC.

**Cloid format**: Must be a 16-byte hex string, e.g., `0x1234567890abcdef1234567890abcdef`.

## Output formatting

Every command accepts:

- `--json` — Force JSON output
- `--format table|csv|json` — Select output format (default: `table`)

Use `--json` when piping to `jq` or other tools.

## Environment variables summary

| Variable                             | Purpose                                        |
| ------------------------------------ | ---------------------------------------------- |
| `BULU_CONFIG_DIR`                    | Override the config/vault directory            |
| `BULU_PASSPHRASE` / `TCX_PASSPHRASE` | Vault passphrase (avoids interactive prompt)   |
| `BULU_APIKEY` / `TCX_APIKEY`         | Agent-mode API key (avoids interactive prompt) |

## Common workflows

### Create a wallet and set it as default

```bash
bulu wallet create my-wallet
bulu wallet switch my-wallet
```

### Sign an Ethereum transaction

```bash
bulu sign tx <unsigned_tx_hex> --wallet my-wallet --chain-id eip155:1
```

### Import a wallet from mnemonic with a specific derivation index

```bash
bulu wallet import recovered-wallet --mnemonic --index 5
```

### Place a limit order on Hyperliquid

```bash
bulu spot order place PURR/USDC buy 100 --price 0.01 --tif gtc
```

### Place a market order on Hyperliquid testnet

```bash
bulu spot order place PURR/USDC sell 50 --type market --testnet
```

### Create an API key bound to specific wallets and policies

```bash
bulu wallet key create trading-bot --wallet main,backup --policy strict-eth --expires-at 1735689600
```

## Important reminders

- Never export or share the `BULU_PASSPHRASE` value in plaintext channels.
- Exported keys (`wallet export`, `wallet export-keystore`) contain sensitive material. Warn the user before suggesting these commands.
- When recommending `wallet delete` or `key revoke`, always include `--confirm`.
- For Hyperliquid orders, verify that the user has set `config.default.wallet` or is passing `--wallet`.
- If a command fails with a passphrase-related error, check whether `BULU_PASSPHRASE` is exported in the environment.
