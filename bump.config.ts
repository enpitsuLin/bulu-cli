import { defineConfig } from 'bumpp'

export default defineConfig({
  files: [
    'packages/bulu-cli/package.json',
    'packages/tcx-core/package.json',
    'packages/tcx-core/Cargo.toml',
    'packages/tcx-core/index.js',
    'Cargo.lock',
  ],
  execute: 'pnpm build',
  commit: true,
  tag: true,
  push: false,
})
