import { defineCommand } from 'citty'
import { useOutput, withOutputArgs } from '#/core/output'
import {
  buildSpotMarketLookup,
  fetchSpotMetaAndAssetCtxs,
  resolveHyperliquidConnectionFromConfig,
  resolveSpotMarket,
} from '#/protocol/hyperliquid'

export default defineCommand({
  meta: { name: 'markets', description: 'List Hyperliquid spot markets' },
  args: withOutputArgs({
    market: {
      type: 'positional',
      description: 'Optional market alias, for example PURR/USDC or @1',
    },
    testnet: {
      type: 'boolean',
      description: 'Use Hyperliquid testnet when config.hyperliquid.apiBase is not set',
      default: false,
    },
  }),
  async run({ args }) {
    const output = useOutput()

    try {
      const connection = resolveHyperliquidConnectionFromConfig({
        testnet: args.testnet,
        envValue: process.env.BULU_HYPERLIQUID,
      })
      const [spotMeta, contexts] = await fetchSpotMetaAndAssetCtxs(connection.apiBase)
      const lookup = buildSpotMarketLookup(spotMeta)
      const targetMarket = args.market ? resolveSpotMarket(spotMeta, args.market) : null
      const rows = lookup.markets
        .filter((market) => !targetMarket || market.asset === targetMarket.asset)
        .map((market) => {
          const context = contexts[market.index]

          return {
            Market: market.displayName,
            Canonical: market.canonicalName,
            Asset: market.asset,
            Base: market.baseToken.name,
            Quote: market.quoteToken.name,
            Mid: context?.midPx ?? '',
            Mark: context?.markPx ?? '',
            '24h Ntl': context?.dayNtlVlm ?? '',
            'Prev Day': context?.prevDayPx ?? '',
            'Sz Decimals': market.szDecimals,
          }
        })

      if (rows.length === 0) {
        output.warn('No spot markets found')
        return
      }

      output.table(rows, {
        columns: ['Market', 'Canonical', 'Asset', 'Base', 'Quote', 'Mid', 'Mark', '24h Ntl', 'Prev Day', 'Sz Decimals'],
        title: `Hyperliquid spot markets (${rows.length})${connection.isTestnet ? ' [testnet]' : ' [mainnet]'}`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      output.warn(`Error: ${message}`)
      process.exit(1)
    }
  },
})
