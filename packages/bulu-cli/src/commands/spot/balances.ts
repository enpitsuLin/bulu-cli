import { defineCommand } from 'citty'
import { getVaultPath, useConfig } from '#/core/config'
import { useOutput, withOutputArgs } from '#/core/output'
import { resolveWalletAddress, useSpotClient } from '#/protocol/hyperliquid'

export default defineCommand({
  meta: { name: 'balances', description: 'Show Hyperliquid spot balances for a wallet' },
  args: withOutputArgs({
    wallet: {
      type: 'string',
      description: 'Wallet name or id; defaults to config.default.wallet',
    },
    testnet: {
      type: 'boolean',
      description: 'Use Hyperliquid testnet when config.hyperliquid.apiBase is not set',
      default: false,
    },
  }),
  async run({ args }) {
    const config = useConfig()
    const client = useSpotClient()
    const output = useOutput()

    try {
      const walletName = args.wallet || config.config.default?.wallet
      if (!walletName) {
        throw new Error('Wallet is required; pass --wallet or set config.default.wallet')
      }

      const vaultPath = getVaultPath()
      const address = resolveWalletAddress(walletName, vaultPath)
      const state = await client.getSpotBalances(address)
      const rows = (state.balances || []).map((balance) => ({
        Coin: balance.coin,
        Token: balance.token,
        Total: balance.total,
        Hold: balance.hold,
        'Entry Ntl': balance.entryNtl,
      }))

      if (rows.length === 0) {
        output.warn(`No spot balances found for ${walletName}`)
        return
      }

      output.table(rows, {
        columns: ['Coin', 'Token', 'Total', 'Hold', 'Entry Ntl'],
        title: `Hyperliquid spot balances - ${walletName}${client.isTestnet ? ' [testnet]' : ' [mainnet]'}`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      output.warn(`Error: ${message}`)
      process.exit(1)
    }
  },
})
