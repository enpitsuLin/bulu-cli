# Repository Guidelines

## Project Layout

- This is a pnpm monorepo and Cargo workspace.
- Root package scripts coordinate work across `packages/*`.
- `packages/tcx-core` is a napi-rs Rust native package exposed to Node.
- `packages/bulu-cli` is the TypeScript CLI package built with tsdown.

## Commands

- Use `pnpm` as the package manager. The workspace declares `pnpm@10.33.0`.
- Build everything with `pnpm run build`.
- Run all package tests with `pnpm run test`.
- Run linting with `pnpm run lint`.
- Format with `pnpm run format`, or the narrower scripts `format:prettier`, `format:toml`, and `format:rs`.

## Testing Requirement

- Before running tests, run `pnpm run build`.
- This is required because the tests rely on the release native crate/binding produced by the napi-rs build.
- Do not substitute a debug build for the normal test workflow unless the user explicitly asks for debug-only investigation.

## Rust Notes

- The Rust workspace currently contains `packages/tcx-core`.
- Root `Cargo.toml` configures the release profile with LTO and symbol stripping.
- Prefer `cargo fmt`, `cargo check -p tcx_core`, and focused `cargo clippy -p tcx_core -- -D warnings` when changing Rust code.

## Working Tree

- Preserve existing user changes. Do not revert unrelated dirty files.
- Keep edits scoped to the package or module involved in the request.
