import { createOutput, resolveOutputOptions } from '../../../core/output'
import { withDefaultArgs } from '../../../core/args-def'
import { resolveTCXPassphrase } from '../../../core/tcx'
import {
  fetchMarketAsset,
  fetchClearinghouseState,
  formatOrderStatus,
  resolvePerpOrder,
  signAndSubmitL1Action,
} from '../../../protocols/hyperliquid'
import type {
  ClearinghouseState,
  HyperliquidMarketAsset,
  OrderResponse,
  OrderSide,
  ResolvedPerpOrder,
} from '../../../protocols/hyperliquid'
import { getVaultPath } from '../../../core/config'
import { requireChainAccount, resolveWallet } from '../../../core/wallet'

export interface PerpOrderPreset {
  side?: OrderSide
  close: boolean
}

export function resolvePerpOrderArgs(mode: 'open' | 'close') {
  return withDefaultArgs({
    coin: {
      type: 'positional',
      description: 'Trading pair symbol, e.g. BTC, ETH',
      required: true,
    },
    size: {
      type: 'string',
      description:
        mode === 'close'
          ? 'Order size in base asset units (omit to close the full position)'
          : 'Order size in base asset units',
      required: mode !== 'close',
    },
    price: {
      type: 'string',
      description: 'Limit price (omit for market order)',
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
  })
}

export async function runPerpOrderCommand(
  args: {
    coin?: string
    size?: string
    price?: string
    testnet?: boolean
    wallet?: string
    json?: boolean
    format?: string
  },
  preset: PerpOrderPreset,
): Promise<void> {
  const coin = String(args.coin).toUpperCase()
  const out = createOutput(resolveOutputOptions(args))
  const { walletName, wallet } = resolveWallet(args.wallet, out)
  const ethAccount = requireChainAccount(wallet, 'eip155:1', out)
  const user = ethAccount.address.toLowerCase()

  let market: HyperliquidMarketAsset
  try {
    market = await fetchMarketAsset(coin, args.testnet)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    out.warn(message)
    process.exit(1)
  }

  let state: ClearinghouseState | undefined
  if (preset.close) {
    try {
      state = await fetchClearinghouseState(user, args.testnet)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      out.warn(`Failed to fetch positions: ${message}`)
      process.exit(1)
    }
  }

  let order: ResolvedPerpOrder
  try {
    order = resolvePerpOrder({
      coin,
      market,
      side: preset.side,
      size: args.size ? String(args.size) : undefined,
      price: args.price ? String(args.price) : undefined,
      close: preset.close,
      state,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    out.warn(message)
    process.exit(1)
  }

  const credential = await resolveTCXPassphrase()

  let response: OrderResponse
  try {
    response = await signAndSubmitL1Action({
      action: order.action,
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
      side: order.side,
      size: order.size,
      price: order.price,
      reduceOnly: order.reduceOnly,
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
    title: `Perp Order | ${walletName} | ${coin} ${order.side.toUpperCase()} ${order.size} @ ${order.price}`,
  })
}
