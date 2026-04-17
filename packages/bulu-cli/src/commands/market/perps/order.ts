import { defineCommand } from 'citty'
import { createOutput, resolveOutputOptions } from '../../../core/output'
import { withDefaultArgs } from '../../../core/args-def'
import { resolveTCXPassphrase } from '../../../core/tcx'
import {
  buildOrderAction,
  fetchClearinghouseState,
  fetchMetaAndAssetCtxs,
  formatOrderStatus,
  formatSize,
  signAndSubmitL1Action,
  stripTrailingZeros,
} from '../../../protocols/hyperliquid'
import { getVaultPath } from '../../../core/config'
import { requireChainAccount, resolveWallet } from '../../../core/wallet'

export default defineCommand({
  meta: { name: 'order', description: 'Place a perp order on Hyperliquid (open or close)' },
  args: withDefaultArgs({
    coin: {
      type: 'positional',
      description: 'Trading pair symbol, e.g. BTC, ETH',
      required: true,
    },
    size: {
      type: 'string',
      description: 'Order size in base asset units',
    },
    price: {
      type: 'string',
      description: 'Limit price (omit for market order)',
    },
    side: {
      type: 'string',
      description: 'Order side: long or short',
      default: 'long',
    },
    close: {
      type: 'boolean',
      description: 'Close/reduce position (auto-reverse side, reduce-only)',
      default: false,
    },
    testnet: {
      type: 'boolean',
      description: 'Use Hyperliquid testnet for signing',
      default: false,
    },
    wallet: {
      type: 'string',
      description: 'Wallet name or id (defaults to active wallet)',
    },
  }),
  async run({ args }) {
    const coin = String(args.coin).toUpperCase()
    const out = createOutput(resolveOutputOptions(args))
    const { walletName, wallet } = resolveWallet(args.wallet, out)
    const ethAccount = requireChainAccount(wallet, 'eip155:1', out)
    const user = ethAccount.address.toLowerCase()

    const isClose = args.close
    let sizeStr = args.size ? String(args.size) : undefined
    let isBuy = args.side === 'short' ? false : true
    let reduceOnly = false

    let assetIndex: number
    let szDecimals: number
    let markPrice: string | undefined
    try {
      const { universe, contexts } = await fetchMetaAndAssetCtxs(args.testnet)
      assetIndex = universe.findIndex((u) => u.name === coin)
      if (assetIndex === -1) {
        throw new Error(`Coin "${coin}" not found on Hyperliquid`)
      }
      szDecimals = universe[assetIndex]?.szDecimals ?? 0
      markPrice = contexts[assetIndex]?.markPx
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      out.warn(message)
      process.exit(1)
    }

    if (isClose) {
      reduceOnly = true
      let state
      try {
        state = await fetchClearinghouseState(user, args.testnet)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        out.warn(`Failed to fetch positions: ${message}`)
        process.exit(1)
      }

      const position = state.assetPositions.find((ap) => ap.position.coin === coin)
      if (!position) {
        out.warn(`No open position for ${coin}`)
        process.exit(1)
      }

      const positionSize = parseFloat(position.position.szi)
      if (positionSize === 0) {
        out.warn(`Position size is zero for ${coin}`)
        process.exit(1)
      }

      if (!sizeStr) {
        sizeStr = position.position.szi.replace(/^-/, '')
      }
      isBuy = positionSize < 0
    } else if (!sizeStr) {
      out.warn('Size is required when opening a position')
      process.exit(1)
    }

    const formattedSize = formatSize(stripTrailingZeros(sizeStr), szDecimals)
    const userPriceStr = args.price ? stripTrailingZeros(String(args.price)) : undefined

    const priceStr = userPriceStr ?? markPrice
    if (!priceStr) {
      out.warn(`Could not fetch mark price for ${coin}`)
      process.exit(1)
    }

    const tif = userPriceStr ? 'Gtc' : 'FrontendMarket'
    const action = buildOrderAction({
      assetIndex,
      isBuy,
      size: formattedSize,
      price: priceStr,
      reduceOnly,
      tif,
    })

    const credential = await resolveTCXPassphrase()

    let response
    try {
      response = await signAndSubmitL1Action({
        action,
        nonce: Date.now(),
        walletName,
        vaultPath: getVaultPath(),
        credential,
        isTestnet: args.testnet,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      out.warn(`Failed to submit order: ${message}`)
      process.exit(1)
    }

    const statuses = response.response.data.statuses
    const rows = statuses.map((status, idx) => ({
      orderIndex: idx + 1,
      result: formatOrderStatus(status),
    }))

    const isJson = args.json || args.format === 'json'
    const isCsv = args.format === 'csv'

    if (isJson) {
      out.data({
        wallet: walletName,
        user,
        coin,
        side: isBuy ? 'long' : 'short',
        size: formattedSize,
        price: priceStr,
        reduceOnly,
        statuses: rows,
      })
      return
    }

    if (isCsv) {
      out.data('orderIndex,result')
      for (const row of rows) {
        out.data(`${row.orderIndex},${row.result}`)
      }
      return
    }

    out.table(rows, {
      columns: ['orderIndex', 'result'],
      title: `Perp Order | ${walletName} | ${coin} ${isBuy ? 'LONG' : 'SHORT'} ${formattedSize} @ ${priceStr}`,
    })
  },
})
