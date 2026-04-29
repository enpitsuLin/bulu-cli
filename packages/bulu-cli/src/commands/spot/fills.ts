import { defineCommand } from 'citty'
import { useConfig } from '#/core/config'
import { withArgs } from '#/core/args'
import { useOutput, outputArgs } from '#/core/output'
import { resolveWalletAddress } from '#/core/wallet'
import { getVaultPath } from '#/core/config'
import { hyperliquidClientArgs } from '#/plugins/hyperliquid-client'
import { formatSpotCoin, isSpotCoin, resolveSpotMarket, useHyperliquidClient } from '#/protocol/hyperliquid'

export default defineCommand({
  meta: { name: 'fills', description: 'Show spot trade history (user fills)' },
  args: withArgs(
    {
      market: {
        type: 'positional',
        description: 'Optional market alias, for example PURR/USDC or @1',
        required: false,
      },
      wallet: {
        type: 'string',
        description: 'Wallet name or id; defaults to config.default.wallet',
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

      const spotMeta = await client.getSpotMeta()
      const targetMarket = args.market ? resolveSpotMarket(spotMeta, args.market) : null
      const vaultPath = getVaultPath()
      const address = resolveWalletAddress(walletName, vaultPath)
      const fills = await client.getUserFills(address)

      const spotFills = fills.filter(
        (f) => isSpotCoin(spotMeta, f.coin) && (!targetMarket || f.coin === targetMarket.canonicalName),
      )

      if (spotFills.length === 0) {
        output.warn('No spot fills found')
        return
      }

      const rows = spotFills.map((f) => ({
        Market: formatSpotCoin(spotMeta, f.coin),
        Time: new Date(f.time).toISOString(),
        Side: f.side === 'B' ? 'Buy' : 'Sell',
        Dir: f.dir,
        Price: f.px,
        Size: f.sz,
        Fee: `${f.fee} ${f.feeToken}`,
        Taker: f.crossed ? 'Yes' : 'No',
        Oid: f.oid,
      }))

      output.table(rows, {
        columns: ['Market', 'Time', 'Side', 'Dir', 'Price', 'Size', 'Fee', 'Taker', 'Oid'],
        title: `Spot fills (${rows.length})${client.isTestnet ? ' [testnet]' : ' [mainnet]'}`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      output.warn(`Error: ${message}`)
      process.exit(1)
    }
  },
})
