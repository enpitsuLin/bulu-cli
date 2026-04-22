import { defineConfig } from 'bumpp'

export default defineConfig({
  files: ['packages/bulu-cli/package.json', 'packages/tcx-core/package.json', 'packages/tcx-core/Cargo.toml'],
  execute: 'pnpm build',
  commit: true,
  tag: true,
  push: false,
})
