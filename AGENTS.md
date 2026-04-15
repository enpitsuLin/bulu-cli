# Repository Guidelines

## Project Overview

**bulu-cli** is a blockchain wallet management CLI tool built with TypeScript and Rust. It supports Ethereum, Tron, and Bitcoin wallets through a local vault-based architecture.

The repository is a pnpm monorepo containing two main packages:

- **`packages/bulu-cli`** — TypeScript CLI application published as `@bulu-cli/core`. Built with `citty` for command routing and `tsdown` (Rolldown-based) for bundling.
- **`packages/tcx-core`** — Rust native package exposed to Node.js via `napi-rs`, published as `@bulu-cli/tcx-core`. Handles cryptographic wallet operations, signing, and vault persistence.

## Technology Stack

- **Package Manager**: `pnpm@10.33.0` (workspace-enabled)
- **Node.js Engine**: `>= 24.0.0`
- **TypeScript**: `^6.0.2` with `@typescript/native-preview` for fast declaration generation
- **Rust Toolchain**: `nightly-2026-04-06` (pinned in `rust-toolchain.toml`)
- **N-API Bindings**: `napi@3.0.0` + `napi-derive@3.0.0` + `napi-build@2`
- **CLI Framework**: `citty` + `@clack/prompts`
- **Testing**: `vitest@^4.1.2` for both Node.js integration tests and TypeScript unit tests
- **Linting**: `oxlint` (TypeScript), `cargo clippy` (Rust)
- **Formatting**: `prettier` (TypeScript/JSON/Markdown/YAML), `taplo` (TOML), `cargo fmt` (Rust)

## Repository Structure

```
.
├── packages/
│   ├── bulu-cli/              # TypeScript CLI
│   │   ├── src/
│   │   │   ├── index.ts       # citty entrypoint
│   │   │   ├── core/          # Shared args, config I/O, output formatters, tcx loader
│   │   │   └── commands/      # config/, sign/, wallet/ subcommands
│   │   ├── tsdown.config.ts
│   │   └── package.json
│   └── tcx-core/              # Rust N-API package
│       ├── src/               # Rust source (wallet, signing, policy, chain signers)
│       ├── __test__/          # Vitest integration tests against compiled .node bindings
│       ├── build.rs           # napi-build setup
│       ├── index.js           # Auto-generated platform loader
│       ├── index.d.ts         # Auto-generated TypeScript declarations
│       ├── Cargo.toml
│       └── package.json
├── scripts/
│   └── bump-version.mjs       # Unified version bumper for JS and Rust packages
├── .github/
│   ├── actions/               # Reusable composite actions (setup-node-pnpm, build-napi-binding)
│   └── workflows/             # CI.yml, publish.yml
├── .cargo/
│   └── config.toml            # Windows static CRT flag
├── vendor/
│   └── token-core-monorepo/   # Git submodule (fork reference, not a path dependency)
├── Cargo.toml                 # Workspace manifest + git patches for tcx-* crates
├── package.json               # Root monorepo manifest
├── pnpm-workspace.yaml
└── rust-toolchain.toml
```

## Build System

### TypeScript (`packages/bulu-cli`)

- Bundled with `tsdown` using `tsdown.config.ts`:
  - Entry: `src/index.ts`
  - Output: `dist/index.mjs`
  - Format: `esm`, platform: `node`, minified
  - `@bulu-cli/tcx-core` is marked as `neverBundle` so the native addon remains an external dependency
- Build command: `pnpm --filter @bulu-cli/core build`

### Rust (`packages/tcx-core`)

- `napi build --platform --release` compiles the crate and generates:
  - Per-platform `.node` binaries (e.g. `tcx-core.linux-x64-gnu.node`)
  - `index.js` and `index.d.ts` (platform-aware loader and types)
- `build.rs` simply calls `napi_build::setup()`
- Cross-compilation uses `napi-rs` with `--use-napi-cross` for GNU Linux targets, leveraging `zig` / `cargo-zigbuild`
- Release profile enables `lto = true` and `strip = "symbols"`

### Dependency Routing for `tcx-*` Crates

`packages/tcx-core/Cargo.toml` references `tcx-btc-kin`, `tcx-common`, `tcx-constants`, `tcx-crypto`, `tcx-eth`, `tcx-keystore`, `tcx-primitive`, and `tcx-tron` via the upstream git URL (`consenlabs/token-core-monorepo`).

The **root** `Cargo.toml` applies `[patch."https://github.com/consenlabs/token-core-monorepo"]` to redirect all of those dependencies to a fork at `https://github.com/enpitsuLin/token-core-monorepo`. The `vendor/token-core-monorepo` submodule exists for reference but is **not** used as a local path dependency during builds.

## Daily Development Commands

```bash
# Install dependencies
pnpm install

# Build all packages (TypeScript + Rust release bindings)
pnpm run build

# Run tests across all packages
pnpm run test

# Lint everything (oxlint + cargo clippy)
pnpm run lint

# Format everything (prettier + taplo + cargo fmt)
pnpm run format
```

### Package-specific Commands

```bash
# Build CLI only
pnpm --filter @bulu-cli/core build

# Build Rust bindings only
pnpm --filter @bulu-cli/tcx-core build

# Run Rust unit tests inside tcx-core
cd packages/tcx-core && cargo test

# Run Node.js integration tests for bindings
pnpm --filter @bulu-cli/tcx-core test
```

## Code Style

- **TypeScript**: Single quotes, no semicolons, 2-space indent, trailing commas, 120 print width, arrow parens always. Enforced via Prettier configuration in root `package.json`.
- **Rust**: 2-space indent (see `rustfmt.toml`), formatted with `cargo fmt`, linted with `cargo clippy -p bulu_cli_tcx_core --all-targets`.
- **TOML**: Formatted with `taplo format`.
- **Comments**: Explain _why_, not _what_ or _how_. Only add comments when the reason is non-obvious.

## Git Hooks

`simple-git-hooks` runs `lint-staged` on `pre-commit`:

- `*.js|ts|tsx` → `oxlint --fix`
- `*.js|ts|tsx|yml|yaml|md|json` → `prettier --write`
- `*.toml` → `taplo format`
- `*.rs` → `rustfmt`

## Testing Strategy

### Rust Tests

- Located inside `packages/tcx-core/src/` (e.g. `wallet/mod.rs`, `signing/mod.rs`).
- Run with `cargo test`.
- Cover wallet creation/import/export/deletion, keystore round-trips, message/transaction signing, policy evaluation, and API key authorization.

### Node.js Integration Tests

- Located in `packages/tcx-core/__test__/index.spec.ts`.
- Run with `vitest run` (120-second timeout configured in `vitest.config.mts`).
- Exercise the compiled N-API bindings directly, covering:
  - Wallet lifecycle
  - Ethereum / Tron / Bitcoin message and transaction signing
  - API key + policy engine (allowed chains, expiry, revocation)

> **Note:** Integration tests require a **release** build of the native bindings. Use `pnpm run build` (not `build:debug`) before running `pnpm run test`.

## CI/CD & Release

### Continuous Integration (`CI.yml`)

Triggered on pushes to `main` and pull requests:

1. **Lint Job** — installs Node/pnpm and Rust, runs `pnpm lint` and `cargo fmt --check`.
2. **Build Matrix** (6 targets):
   - `x86_64-apple-darwin`
   - `x86_64-pc-windows-msvc`
   - `x86_64-unknown-linux-gnu`
   - `aarch64-apple-darwin`
   - `aarch64-unknown-linux-gnu`
   - `aarch64-pc-windows-msvc`
3. **Test Jobs**:
   - macOS/Windows bindings tested natively on x64 and ARM64 runners with Node 20 & 22
   - Linux bindings tested inside Docker (`node:20-slim` / `node:22-slim`) on matching architecture runners

### Publish Workflow (`publish.yml`)

Triggered on tags matching `v*`:

1. Builds all 6 native targets (same matrix as CI).
2. Builds `@bulu-cli/core`.
3. Runs `napi create-npm-dirs`, moves artifacts into per-platform npm packages (`packages/tcx-core/npm/*`).
4. Publishes to npm with `--provenance --access public`.
   - Stable tags (`v1.2.3`) publish to `latest`.
   - Prerelease tags (`v1.2.3-alpha.1`) publish to the prerelease identifier tag.
5. Creates a GitHub Release with auto-generated notes.

### Version Bumping

Use `pnpm run bump` (runs `scripts/bump-version.mjs`). It interactively bumps:

- `packages/bulu-cli/package.json`
- `packages/tcx-core/package.json`
- `packages/tcx-core/Cargo.toml`
- `Cargo.lock`

The script:

1. Ensures all sources are in sync.
2. Prompts for the next semver version.
3. Runs `pnpm build` and auto-stages generated napi artifacts (`index.js`, `index.d.ts`, `browser.js`).
4. Creates a commit `chore: release vX.Y.Z`, an annotated tag `vX.Y.Z`, and pushes both.

Options include `--dry-run`, `--yes`, `--no-commit`, `--no-tag`, and `--no-push`.

## Security Considerations

- **Credentials** (passphrase or API key) are resolved via environment variables (`TCX_PASSPHRASE` / `BULU_PASSPHRASE` for passphrases, `TCX_APIKEY` / `BULU_APIKEY` for API keys) or an interactive `@clack/prompts` prompt. They are never persisted to disk.
- **Vault data** (wallets, policies, API keys) is stored as JSON files in the local vault directory (`~/.bulu/vault/` by default, configurable via `bulu config`). Keystores are encrypted; the vault does not store raw private keys in plaintext.
- **Agent mode** allows creating revocable API keys and declarative signing policies. This enables automated/scripted signing without exposing the master passphrase.
- **Static linking on Windows** (`+crt-static`) ensures the native module does not depend on a specific MSVC runtime being present on the target machine.

## Useful Reference

- `packages/bulu-cli/README.md` — End-user CLI usage guide.
- `packages/tcx-core/README.md` — TypeScript API examples for wallet creation, agent mode, and signing.
- `packages/tcx-core/src/napi.rs` — The public surface area exposed to JavaScript.
