import { defineCommand } from 'citty'
import { getVaultPath, useConfig } from '#/core/config'
import { withArgs } from '#/core/args'
import { useOutput, outputArgs } from '#/core/output'
import { resolveWalletAddress } from '#/core/wallet'
import { hyperliquidClientArgs } from '#/plugins/hyperliquid-client'
import {
  buildPerpMarketLookup,
  formatPerpCoin,
  isPerpCoin,
  resolvePerpDexIndex,
  resolvePerpMarket,
  useHyperliquidClient,
} from '#/protocol/hyperliquid'

function formatFillDirection(direction: string): string {
  const normalized = direction.trim()
  const lower = normalized.toLowerCase()

  if (lower === 'open long') return 'Open Long'
  if (lower === 'open short') return 'Open Short'
  if (lower === 'close long') return 'Close Long'
  if (lower === 'close short') return 'Close Short'
  if (lower === 'buy') return 'Buy'
  if (lower === 'sell') return 'Sell'

  return normalized
}

export default defineCommand({
  meta: { name: 'fills', description: 'Show Hyperliquid perpetual trade history' },
  args: withArgs(
    {
      coin: {
        type: 'positional',
        description: 'Optional perp coin, for example BTC or ETH',
        required: false,
      },
      wallet: {
        type: 'string',
        description: 'Wallet name or id; defaults to config.default.wallet',
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
    const config = useConfig()
    const client = useHyperliquidClient()
    const output = useOutput()

    try {
      const walletName = args.wallet || config.config.default?.wallet
      if (!walletName) {
        throw new Error('Wallet is required; pass --wallet or set config.default.wallet')
      }

      const dex = args.dex?.trim() ?? ''
      const perpDexIndex = dex ? resolvePerpDexIndex(await client.getPerpDexs(), dex) : 0
      const perpMeta = await client.getPerpMeta(dex)
      const lookup = buildPerpMarketLookup(perpMeta, perpDexIndex)
      const targetMarket = args.coin ? resolvePerpMarket(lookup, args.coin) : null
      const vaultPath = getVaultPath()
      const address = resolveWalletAddress(walletName, vaultPath)
      const fills = await client.getUserFills(address, dex)
      const rows = fills
        .filter((fill) => isPerpCoin(lookup, fill.coin))
        .filter((fill) => !targetMarket || fill.coin.toUpperCase() === targetMarket.coin.toUpperCase())
        .map((fill) => ({
          Coin: formatPerpCoin(lookup, fill.coin),
          Time: new Date(fill.time).toISOString(),
          Side: fill.side === 'B' ? 'Buy' : 'Sell',
          Direction: formatFillDirection(fill.dir),
          Price: fill.px,
          Size: fill.sz,
          'Closed PnL': fill.closedPnl,
          Fee: `${fill.fee} ${fill.feeToken}`,
          Taker: fill.crossed ? 'Yes' : 'No',
          Oid: fill.oid,
        }))

      if (rows.length === 0) {
        output.warn('No perp fills found')
        return
      }

      output.table(rows, {
        columns: ['Coin', 'Time', 'Side', 'Direction', 'Price', 'Size', 'Closed PnL', 'Fee', 'Taker', 'Oid'],
        title: `Hyperliquid perp fills (${rows.length})${dex ? ` [dex=${dex}]` : ''}${
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
