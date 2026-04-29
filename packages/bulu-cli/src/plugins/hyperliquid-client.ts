import { defineCittyPlugin, type ParsedArgs, type ArgsDef } from 'citty'
import { createHyperliquidClient, hyperliquidClientCtx } from '#/protocol/hyperliquid/client'

export const hyperliquidClientArgs = {
  testnet: {
    type: 'boolean',
    description: 'Should interact with Hyperliquid testnet',
    default: false,
  },
} satisfies ArgsDef

export default defineCittyPlugin({
  name: 'hyperliquid-client',
  setup({ args }) {
    const { testnet = false } = args as ParsedArgs<typeof hyperliquidClientArgs>
    hyperliquidClientCtx.set(createHyperliquidClient({ testnet }))
  },
  cleanup() {
    hyperliquidClientCtx.unset()
  },
})
