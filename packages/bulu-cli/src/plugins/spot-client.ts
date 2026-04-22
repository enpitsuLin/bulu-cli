import { defineCittyPlugin } from 'citty'
import { createHyperliquidSpotClient, hyperliquidSpotClientCtx } from '#/protocol/hyperliquid'

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
  name: 'spot-client',
  setup({ rawArgs }) {
    hyperliquidSpotClientCtx.set(
      createHyperliquidSpotClient({
        testnet: parseSpotTestnetFlag(rawArgs),
        envValue: process.env.BULU_HYPERLIQUID,
      }),
    )
  },
  cleanup() {
    hyperliquidSpotClientCtx.unset()
  },
})
