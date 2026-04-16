import { defineCommand } from 'citty'
import { getWallet, signTypedData } from '@bulu-cli/tcx-core'
import { getActiveWallet, getVaultPath } from '../../../core/config'
import { createOutput, resolveOutputOptions } from '../../../core/output'
import { withDefaultArgs } from '../../../core/args-def'
import { resolveTCXPassphrase } from '../../../core/tcx'
import {
  fetchClearinghouseState,
  fetchMetaAndAssetCtxs,
  splitSignature,
  submitExchangeRequest,
} from '../../../protocols/hyperliquid/client'
import { createL1ActionHash, buildHyperliquidTypedData } from '../../../protocols/hyperliquid/signing'
import type { OrderRequestBody, OrderStatus } from '../../../protocols/hyperliquid/types'

function stripTrailingZeros(value: string): string {
  if (!value.includes('.')) return value
  return value.replace(/\.?0+$/, '')
}

function formatSize(value: string, decimals: number): string {
  if (!value.includes('.')) return value
  const [intPart, fracPart] = value.split('.')
  const trimmed = fracPart.slice(0, decimals)
  const combined = `${intPart}.${trimmed}`
  return stripTrailingZeros(combined)
}

function formatOrderStatus(status: OrderStatus): string {
  if (typeof status === 'string') return status
  if ('resting' in status) return `resting (oid: ${status.resting.oid})`
  if ('filled' in status) return `filled (sz: ${status.filled.totalSz}, avgPx: ${status.filled.avgPx})`
  if ('error' in status) return `error: ${status.error}`
  return 'unknown'
}

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
    const walletName = args.wallet ? String(args.wallet) : getActiveWallet()
    const out = createOutput(resolveOutputOptions(args))

    if (!walletName) {
      out.warn('No wallet specified and no active wallet configured')
      process.exit(1)
    }

    const vaultPath = getVaultPath()
    let wallet
    try {
      wallet = getWallet(walletName, vaultPath)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      out.warn(`Failed to load wallet: ${message}`)
      process.exit(1)
    }

    const ethAccount = wallet.accounts.find((a) => a.chainId === 'eip155:1')
    if (!ethAccount) {
      out.warn('Wallet has no Ethereum account (eip155:1) required for Hyperliquid')
      process.exit(1)
    }

    const user = ethAccount.address.toLowerCase()
    const isClose = args.close
    let sizeStr = args.size ? String(args.size) : undefined
    let isBuy = args.side === 'short' ? false : true
    let reduceOnly = false

    let assetIndex: number
    let szDecimals: number
    let markPrice: string | undefined
    try {
      const { universe, contexts } = await fetchMetaAndAssetCtxs()
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
        state = await fetchClearinghouseState(user)
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
    } else {
      if (!sizeStr) {
        out.warn('Size is required when opening a position')
        process.exit(1)
      }
    }

    const formattedSize = formatSize(stripTrailingZeros(sizeStr), szDecimals)

    const userPriceStr = args.price ? stripTrailingZeros(String(args.price)) : undefined
    let priceStr: string
    let tif: 'Gtc' | 'Ioc' | 'FrontendMarket'

    if (userPriceStr) {
      priceStr = userPriceStr
      tif = 'Gtc'
    } else {
      if (!markPrice) {
        out.warn(`Could not fetch mark price for ${coin}`)
        process.exit(1)
      }
      priceStr = stripTrailingZeros(markPrice)
      tif = 'FrontendMarket'
    }

    const action = {
      type: 'order' as const,
      orders: [
        {
          a: assetIndex,
          b: isBuy,
          p: priceStr,
          s: formattedSize,
          r: reduceOnly,
          t: { limit: { tif } },
        },
      ],
      grouping: 'na' as const,
    }

    const nonce = Date.now()
    const credential = await resolveTCXPassphrase()

    let hash: `0x${string}`
    try {
      hash = createL1ActionHash({ action, nonce })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      out.warn(`Failed to create action hash: ${message}`)
      process.exit(1)
    }

    const typedData = buildHyperliquidTypedData({ hash, isTestnet: args.testnet })

    let signatureHex: string
    try {
      const signed = signTypedData(walletName, 'eip155:1', JSON.stringify(typedData), credential, vaultPath)
      signatureHex = signed.signature
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      out.warn(`Failed to sign order: ${message}`)
      process.exit(1)
    }

    let signature: ReturnType<typeof splitSignature>
    try {
      signature = splitSignature(signatureHex as `0x${string}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      out.warn(`Failed to parse signature: ${message}`)
      process.exit(1)
    }

    const body: OrderRequestBody = {
      action,
      nonce,
      signature,
    }

    let response: import('../../../protocols/hyperliquid/types').OrderResponse
    try {
      response = await submitExchangeRequest(body)
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
        price: priceStr ?? 'market',
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
      title: `Perp Order | ${walletName} | ${coin} ${isBuy ? 'LONG' : 'SHORT'} ${formattedSize} @ ${priceStr ?? 'MARKET'}`,
    })
  },
})
