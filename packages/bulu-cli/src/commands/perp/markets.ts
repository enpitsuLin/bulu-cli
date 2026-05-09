import { defineCommand } from 'citty'
import { withArgs } from '#/core/args'
import { useOutput, outputArgs } from '#/core/output'
import { hyperliquidClientArgs } from '#/plugins/hyperliquid-client'
import {
  buildPerpMarketLookup,
  resolvePerpDexIndex,
  resolvePerpMarket,
  useHyperliquidClient,
} from '#/protocol/hyperliquid'

export default defineCommand({
  meta: { name: 'markets', description: 'List Hyperliquid perpetual markets' },
  args: withArgs(
    {
      coin: {
        type: 'positional',
        description: 'Optional perp coin, for example BTC or ETH',
        required: false,
      },
      dex: {
        type: 'string',
        description: 'Optional builder-deployed perp dex name',
      },
    },
    outputArgs,
    hyperliquidClientArgs,
  ),
  async run({ args }) {
    const client = useHyperliquidClient()
    const output = useOutput()

    try {
      const dex = args.dex?.trim() ?? ''
      const perpDexIndex = dex ? resolvePerpDexIndex(await client.getPerpDexs(), dex) : 0
      const [perpMeta, contexts] = await client.getPerpMetaAndAssetCtxs(dex)
      const lookup = buildPerpMarketLookup(perpMeta, perpDexIndex)
      const targetMarket = args.coin ? resolvePerpMarket(lookup, args.coin) : null
      const rows = lookup.markets
        .filter((market) => !targetMarket || market.asset === targetMarket.asset)
        .map((market) => {
          const context = contexts[market.index]

          return {
            Coin: market.coin,
            Asset: market.asset,
            Mid: context?.midPx ?? '',
            Mark: context?.markPx ?? '',
            Oracle: context?.oraclePx ?? '',
            Funding: context?.funding ?? '',
            'Open Interest': context?.openInterest ?? '',
            '24h Ntl': context?.dayNtlVlm ?? '',
            'Prev Day': context?.prevDayPx ?? '',
            'Max Lev': market.maxLeverage,
            'Margin Mode': market.marginMode ?? (market.onlyIsolated ? 'isolated' : 'cross'),
            Delisted: market.isDelisted ? 'Yes' : 'No',
            'Sz Decimals': market.szDecimals,
          }
        })

      if (rows.length === 0) {
        output.warn('No perp markets found')
        return
      }

      output.table(rows, {
        columns: [
          'Coin',
          'Asset',
          'Mid',
          'Mark',
          'Oracle',
          'Funding',
          'Open Interest',
          '24h Ntl',
          'Prev Day',
          'Max Lev',
          'Margin Mode',
          'Delisted',
          'Sz Decimals',
        ],
        title: `Hyperliquid perp markets (${rows.length})${dex ? ` [dex=${dex}]` : ''}${
          client.isTestnet ? ' [testnet]' : ' [mainnet]'
        }`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      output.warn(`Error: ${message}`)
      process.exit(1)
    }
  },
})
