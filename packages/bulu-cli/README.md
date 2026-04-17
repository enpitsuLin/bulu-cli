# @bulu-cli/core

`@bulu-cli/core` provides the `bulu` command-line tool for local wallet management, signing, and Hyperliquid market operations.

## Install

Requirements:

- Node.js `>= 24`
- `pnpm`

Install globally:

```bash
pnpm add -g @bulu-cli/core
```

Or run from this monorepo:

```bash
pnpm --filter @bulu-cli/core build
node packages/bulu-cli/dist/index.mjs --help
```

## Configuration

Initialize the default config file:

```bash
bulu config init
```

By default, config is stored in:

- config: `~/.config/bulu/bulu.config.json`
- vault: `~/.config/bulu/vault/`

You can override the config directory with:

```bash
export BULU_CONFIG_DIR=/path/to/custom/config
```

Inspect or update config values:

```bash
bulu config list
bulu config get default.wallet
bulu config set default.format json
bulu config set hyperliquid.apiBase https://api.hyperliquid.xyz
```

## Credentials

Commands that need wallet decryption resolve credentials in this order:

- `TCX_PASSPHRASE`
- `BULU_PASSPHRASE`
- interactive prompt

Agent-mode API key based signing uses:

- `TCX_APIKEY`
- `BULU_APIKEY`

## Wallet Management

Create a wallet:

```bash
bulu wallet create main
```

Import from private key, mnemonic, keystore, file, or stdin:

```bash
bulu wallet import trading 0x<private-key>
bulu wallet import trading --mnemonic
bulu wallet import trading --keystore
bulu wallet import trading --file ./secret.txt
cat ./secret.txt | bulu wallet import trading
```

Common wallet commands:

```bash
bulu wallet list
bulu wallet info main
bulu wallet switch main
bulu wallet export main
bulu wallet export-keystore main
bulu wallet delete old-wallet
```

## Signing

Sign raw messages, transactions, or EIP-712 / TIP-712 typed data:

```bash
bulu sign message "hello" --wallet main --chain-id eip155:1
bulu sign tx 0x02f86b... --wallet main --chain-id eip155:1
bulu sign typed-data "$(cat ./typed-data.json)" --wallet main --chain-id eip155:1
```

## Agent Mode

`bulu` supports API keys and signing policies for delegated signing workflows.

```bash
bulu wallet policy create
bulu wallet policy list

bulu wallet key create trader-bot
bulu wallet key list
bulu wallet key revoke trader-bot
```

See `packages/tcx-core/README.md` for the underlying TypeScript API surface and policy model.

## Market Data

Fetch Hyperliquid price and balance data:

```bash
bulu market price BTC
bulu market price ETH --period 1h

bulu market spot positions
bulu market perps positions
bulu market perps orders
```

Most market commands support:

- `--wallet <name>` to target a specific wallet
- `--testnet` for Hyperliquid testnet
- `--format table|csv|json`
- `--json` as shorthand for JSON output

## Hyperliquid Perps

### Basic Trading

Open, increase, reduce, or close positions:

```bash
bulu market perps long BTC --size 0.01
bulu market perps short ETH --size 0.5 --price 2400
bulu market perps close BTC
bulu market perps close BTC --size 0.005
```

- Omitting `--price` submits a market-style order.
- `close` is reduce-only and can close the full position when `--size` is omitted.

### Order Management

Inspect and manage open orders:

```bash
bulu market perps orders
bulu market perps status 123456789
bulu market perps cancel 123456789
bulu market perps cancel --all
bulu market perps cancel --all --coin BTC
```

Modify an existing order by oid or cloid:

```bash
bulu market perps modify 123456789 --price 95000
bulu market perps modify 123456789 --size 0.02
bulu market perps modify 0x1234567890abcdef1234567890abcdef --trigger 92000 --price 91900 --sl
```

### TP / SL

Place reduce-only take profit and stop loss orders against an open position:

```bash
bulu market perps stop-loss BTC --trigger 91000
bulu market perps stop-loss BTC --trigger 91000 --price 90900

bulu market perps take-profit BTC --trigger 98000
bulu market perps take-profit BTC --trigger 98000 --price 98100 --size 0.005
```

- Omitting `--price` creates a market TP/SL order.
- Setting `--price` creates a triggered limit order.
- Omitting `--size` targets the full current position size at placement time.

### Fills And History

Inspect recent fills and historical orders:

```bash
bulu market perps fills
bulu market perps fills --coin BTC --limit 100
bulu market perps fills --since 2026-04-01T00:00:00Z --until 2026-04-17T00:00:00Z

bulu market perps history
bulu market perps history --coin ETH --status filled --limit 50
```

### Leverage And Margin

Update leverage, isolated margin, and scheduled cancel:

```bash
bulu market perps leverage BTC 5
bulu market perps leverage BTC 3 --isolated

bulu market perps margin BTC 25
bulu market perps margin BTC -10.5

bulu market perps schedule-cancel --at 2026-04-17T12:00:00Z
bulu market perps schedule-cancel --clear
```

## Output Formats

All commands use table output by default. For automation:

```bash
bulu wallet list --json
bulu market perps positions --format csv
bulu market perps fills --format json
```

## Notes

- Hyperliquid perps commands require an Ethereum account in the selected wallet because requests are signed as `eip155:1`.
- Testnet requests use `https://api.hyperliquid-testnet.xyz` unless overridden in config.
- Private keys passed directly on the command line may be visible in shell history; prefer stdin or `--file` for sensitive material.
