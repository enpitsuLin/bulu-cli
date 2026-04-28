import { defineCittyPlugin, type ParsedArgs, type ArgsDef, type Resolvable } from 'citty'
import { createHyperliquidClient, hyperliquidClientCtx } from '#/protocol/hyperliquid/client'

export const hyperliquidClientArgs = {
  testnet: {
    type: 'boolean',
    description: 'Should interact with Hyperliquid testnet',
    default: false,
  },
} satisfies ArgsDef

export async function withHyperliquidClientArgs<T extends ArgsDef = ArgsDef>(
  args: Resolvable<T>,
): Promise<typeof hyperliquidClientArgs & T> {
  const resolveArgs = typeof args === 'function' ? args() : args

  return {
    ...(await resolveArgs),
    ...hyperliquidClientArgs,
  }
}

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
