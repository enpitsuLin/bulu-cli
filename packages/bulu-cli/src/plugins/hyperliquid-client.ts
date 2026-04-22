import { defineCittyPlugin } from 'citty'
import { createHyperliquidClient, hyperliquidClientCtx } from '#/protocol/hyperliquid/client'

function parseBooleanFlagValue(value: string): boolean {
  return !['0', 'false', 'no', 'off'].includes(value.trim().toLowerCase())
}

function parseSpotTestnetFlag(rawArgs: string[]): boolean | undefined {
  let testnet: boolean | undefined

  for (const arg of rawArgs) {
    if (arg === '--testnet') {
      testnet = true
      continue
    }
    if (arg === '--no-testnet') {
      testnet = false
      continue
    }
    if (arg.startsWith('--testnet=')) {
      testnet = parseBooleanFlagValue(arg.slice('--testnet='.length))
    }
  }

  return testnet
}

export default defineCittyPlugin({
  name: 'hyperliquid-client',
  setup({ rawArgs }) {
    hyperliquidClientCtx.set(
      createHyperliquidClient({
        testnet: parseSpotTestnetFlag(rawArgs),
        envValue: process.env.BULU_HYPERLIQUID,
      }),
    )
  },
  cleanup() {
    hyperliquidClientCtx.unset()
  },
})
