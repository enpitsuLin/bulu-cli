import { defineConfig } from 'tsdown'

export default defineConfig({
  dts: {
    tsgo: true,
  },
  entry: ['src/index.ts'],
  format: 'esm',
  platform: 'node',
  minify: true,
  deps: {
    neverBundle: ['@bulu-cli/tcx-core'],
    onlyBundle: false,
  },
})
