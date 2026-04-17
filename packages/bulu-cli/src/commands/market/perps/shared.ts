import { createOutput } from '../../../core/output'
import {
  handleCommandError,
  resolveMarketOutput,
  resolveMarketQueryArgs,
  resolveMarketUserContext,
  submitExchangeAction,
} from '../shared'
import {
  fetchClearinghouseState,
  fetchMarketAsset,
  formatOrderStatus,
  resolvePerpOrder,
} from '../../../protocols/hyperliquid'
import type {
  ClearinghouseState,
  HyperliquidMarketAsset,
  OrderResponse,
  OrderSide,
  ResolvedPerpOrder,
} from '../../../protocols/hyperliquid'

export interface PerpOrderPreset {
  side?: OrderSide
  close: boolean
}

export interface PerpCommandArgs {
  wallet?: string
  testnet?: boolean
  json?: boolean
  format?: string
}

export interface PerpUserContext {
  walletName: string
  user: string
}

export { handleCommandError, submitExchangeAction } from '../shared'

export function resolvePerpQueryArgs(extraArgs: Record<string, unknown> = {}) {
  return resolveMarketQueryArgs(extraArgs)
}

export function resolvePerpOrderArgs(mode: 'open' | 'close') {
  return resolvePerpQueryArgs({
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
  })
}

export function resolvePerpOutput(args: Pick<PerpCommandArgs, 'json' | 'format'>) {
  return resolveMarketOutput(args)
}

export function resolvePerpUserContext(
  args: Pick<PerpCommandArgs, 'wallet'>,
  out: ReturnType<typeof createOutput>,
): PerpUserContext {
  return resolveMarketUserContext(args, out)
}

export async function loadPerpMarketOrExit(
  coin: string,
  isTestnet: boolean | undefined,
  out: ReturnType<typeof createOutput>,
): Promise<HyperliquidMarketAsset> {
  try {
    return await fetchMarketAsset(coin, isTestnet)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return handleCommandError(out, message)
  }
}

export async function loadPerpStateOrExit(
  user: string,
  isTestnet: boolean | undefined,
  out: ReturnType<typeof createOutput>,
): Promise<ClearinghouseState> {
  try {
    return await fetchClearinghouseState(user, isTestnet)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return handleCommandError(out, `Failed to fetch positions: ${message}`)
  }
}

export function renderOrderSubmission(args: {
  out: ReturnType<typeof createOutput>
  commandArgs: Pick<PerpCommandArgs, 'json' | 'format'>
  walletName: string
  user: string
  coin: string
  order: ResolvedPerpOrder
  response: OrderResponse
  titlePrefix?: string
}) {
  const { out, commandArgs, walletName, user, coin, order, response, titlePrefix = 'Perp Order' } = args
  const statuses = response.response.data.statuses
  const rows = statuses.map((status, idx) => ({
    orderIndex: idx + 1,
    result: formatOrderStatus(status),
  }))

  const isJson = commandArgs.json || commandArgs.format === 'json'
  const isCsv = commandArgs.format === 'csv'

  if (isJson) {
    out.data({
      wallet: walletName,
      user,
      coin,
      side: order.side,
      size: order.size,
      price: order.price,
      triggerPx: order.triggerPx,
      triggerKind: order.triggerKind,
      reduceOnly: order.reduceOnly,
      grouping: order.grouping,
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

  const detail = order.isTrigger
    ? `${coin} ${String(order.triggerKind).toUpperCase()} ${order.size} trigger ${order.triggerPx} -> ${order.price}`
    : `${coin} ${order.side.toUpperCase()} ${order.size} @ ${order.price}`

  out.table(rows, {
    columns: ['orderIndex', 'result'],
    title: `${titlePrefix} | ${walletName} | ${detail}`,
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
  const out = resolvePerpOutput(args)
  const { walletName, user } = resolvePerpUserContext(args, out)
  const market = await loadPerpMarketOrExit(coin, args.testnet, out)

  const state = preset.close ? await loadPerpStateOrExit(user, args.testnet, out) : undefined

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
    handleCommandError(out, message)
  }

  let response: OrderResponse
  try {
    response = await submitExchangeAction<OrderResponse>({
      action: order.action,
      walletName,
      testnet: args.testnet,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    handleCommandError(out, `Failed to submit order: ${message}`)
  }

  renderOrderSubmission({
    out,
    commandArgs: args,
    walletName,
    user,
    coin,
    order,
    response,
  })
}
