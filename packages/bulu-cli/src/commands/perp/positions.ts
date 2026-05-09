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

export default defineCommand({
  meta: { name: 'positions', description: 'Show Hyperliquid perpetual account and open positions' },
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
      const state = await client.getClearinghouseState(address, dex)

      output.table(
        [
          {
            'Account Value': state.marginSummary.accountValue,
            Withdrawable: state.withdrawable,
            'Total Ntl Pos': state.marginSummary.totalNtlPos,
            'Total Raw USD': state.marginSummary.totalRawUsd,
            'Total Margin Used': state.marginSummary.totalMarginUsed,
            'Cross Maint Used': state.crossMaintenanceMarginUsed,
          },
        ],
        {
          columns: [
            'Account Value',
            'Withdrawable',
            'Total Ntl Pos',
            'Total Raw USD',
            'Total Margin Used',
            'Cross Maint Used',
          ],
          title: `Hyperliquid perp account - ${walletName}${dex ? ` [dex=${dex}]` : ''}${
            client.isTestnet ? ' [testnet]' : ' [mainnet]'
          }`,
        },
      )

      const rows = state.assetPositions
        .filter((item) => isPerpCoin(lookup, item.position.coin))
        .filter((item) => !targetMarket || item.position.coin.toUpperCase() === targetMarket.coin.toUpperCase())
        .map((item) => {
          const position = item.position
          const size = Number(position.szi)

          return {
            Coin: formatPerpCoin(lookup, position.coin),
            Side: size > 0 ? 'Long' : size < 0 ? 'Short' : 'Flat',
            Size: position.szi,
            'Entry Px': position.entryPx,
            'Position Value': position.positionValue,
            'Unrealized PnL': position.unrealizedPnl,
            ROE: position.returnOnEquity,
            'Liq Px': position.liquidationPx ?? '',
            'Margin Used': position.marginUsed ?? '',
            Leverage: position.leverage ? `${position.leverage.value}x ${position.leverage.type}` : '',
          }
        })

      if (rows.length === 0) {
        output.warn('No open perp positions found')
        return
      }

      output.table(rows, {
        columns: [
          'Coin',
          'Side',
          'Size',
          'Entry Px',
          'Position Value',
          'Unrealized PnL',
          'ROE',
          'Liq Px',
          'Margin Used',
          'Leverage',
        ],
        title: `Open Hyperliquid perp positions (${rows.length})${dex ? ` [dex=${dex}]` : ''}`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      output.warn(`Error: ${message}`)
      process.exit(1)
    }
  },
})
