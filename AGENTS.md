# Repository Guidelines

## Project Overview

**bulu-cli** - A blockchain wallet management CLI tool built with TypeScript and Rust, supporting Ethereum and Tron networks.

- **`packages/bulu-cli`** - TypeScript CLI application
- **`packages/tcx-core`** - Rust native package (exposed to Node.js via napi-rs)

## Commands

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm run build

# Run tests (requires release build: use `pnpm run build`, not `build:debug`)
pnpm run test

# Linting
pnpm run lint

# Formatting
pnpm run format
```

## Code Style

- **TypeScript**: Single quotes, no semicolons, 2-space indent, Prettier
- **Rust**: 2-space indent, `cargo fmt` to format, `cargo clippy` to lint
