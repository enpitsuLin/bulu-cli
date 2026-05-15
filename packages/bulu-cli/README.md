# @bulu-cli/core

`bulu` is a local wallet and trading CLI. It manages encrypted Ethereum and Tron wallets, signs messages and transactions locally, supports policy-based agent keys, and includes Hyperliquid spot/perp commands.

## Install

```bash
pnpm add -g @bulu-cli/core
```

Requires Node.js >= 24.0.0.

## Vault and Config

The CLI stores its config at `~/.config/bulu/bulu.config.json` and its vault records under `~/.config/bulu/vault/` by default. Set `BULU_CONFIG_DIR` to use a different config and vault root.

Credentials are resolved in this order:

1. `TCX_PASSPHRASE` or `BULU_PASSPHRASE`
2. `TCX_APIKEY` or `BULU_APIKEY`
3. Interactive password prompt

Passphrases and API keys are never persisted by the CLI.

## Wallets

```bash
bulu wallet create main
bulu wallet import recovered --mnemonic
bulu wallet list
bulu wallet info main
bulu wallet switch main
bulu wallet export main --confirm
bulu wallet export-keystore main --confirm
bulu wallet delete main --confirm
```

Wallets derive Ethereum and Tron accounts by default. Mnemonic imports accept `--index <n>` to choose the default account index.

## Signing

```bash
bulu sign message "hello" --wallet main --chain-id eip155:1
bulu sign tx <unsigned_tx_hex> --wallet main --chain-id eip155:1
bulu sign typed-data '<typed_data_json>' --wallet main --chain-id eip155:1
```

The `--chain-id` value is a CAIP-2 chain id such as `eip155:1`, `eip155:11155111`, or `tron:0x2b6653dc`.

## Agent Mode

```bash
bulu wallet policy create policy.json
bulu wallet key create bot --wallet main --policy eth-only --expires-at 1735689600
bulu wallet key list
bulu wallet key revoke bot --confirm
```

API keys can be bound to wallets and policies. A policy can restrict chains, expiry, EIP-712 primary types, and verifying contracts.

## Config

```bash
bulu config list
bulu config get default.wallet
bulu config set default.wallet main
bulu config set chains.eip155:1.rpc https://1rpc.io/eth
```

Common config keys include `default.wallet`, `default.format`, `chains.<caip2>.rpc`, and Hyperliquid settings such as `hyperliquid.apiBase`, `hyperliquid.retry`, `hyperliquid.retryDelay`, and `hyperliquid.timeout`.

## Hyperliquid

All spot and perp commands accept `--testnet`.

```bash
bulu spot markets
bulu spot balances --wallet main
bulu spot order place PURR/USDC buy 100 --price 0.01 --tif gtc
bulu spot order place PURR/USDC sell 50 --type market --slippage 0.03
bulu spot transfer 10 --to-perp --wallet main

bulu perp markets
bulu perp positions --wallet main
bulu perp order place BTC buy 0.01 --type market
bulu perp leverage BTC 5 --cross --wallet main
```

Market orders derive an IOC limit price from the current mid price plus the requested slippage. Client order ids (`--cloid`) must be 16-byte hex strings.

## Output

Every command accepts:

- `--json` to force JSON output
- `--format table|csv|json` to select output format

Use `--json` when piping output into scripts.
