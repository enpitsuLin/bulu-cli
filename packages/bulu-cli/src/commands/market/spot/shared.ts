import { createOutput } from '../../../core/output'
import {
  buildSpotPairNameSet,
  fetchSpotMarketAsset,
  fetchSpotMeta,
  fetchSpotMetaAndAssetCtxs,
  formatOrderStatus,
  normalizeSpotPair,
  resolveSpotOrder,
} from '../../../protocols/hyperliquid'
import type {
  AssetCtx,
  HyperliquidSpotMarketAsset,
  OrderResponse,
  ResolvedSpotOrder,
  SpotMeta,
  SpotOrderSide,
} from '../../../protocols/hyperliquid'
import {
  handleCommandError,
  resolveMarketOutput,
  resolveMarketQueryArgs,
  resolveMarketUserContext,
  submitExchangeAction,
} from '../shared'

export interface SpotCommandArgs {
  wallet?: string
  legacyWallet?: string
  testnet?: boolean
  json?: boolean
  format?: string
}

export interface SpotUserContext {
  walletName: string
  user: string
}

export interface SpotMarketState {
  meta: SpotMeta
  contexts: AssetCtx[]
}

export function resolveSpotQueryArgs(extraArgs: Record<string, unknown> = {}) {
  return resolveMarketQueryArgs(extraArgs)
}

export function resolveSpotOrderArgs() {
  return resolveSpotQueryArgs({
    pair: {
      type: 'positional',
      description: 'Exact Hyperliquid spot pair, e.g. PURR/USDC, UBTC/USDC, @107',
      required: true,
    },
    size: {
      type: 'string',
      description: 'Order size in base asset units',
      required: true,
    },
    price: {
      type: 'string',
      description: 'Limit price (omit for market order)',
    },
  })
}

export function resolveSpotOutput(args: Pick<SpotCommandArgs, 'json' | 'format'>) {
  return resolveMarketOutput(args)
}

export function resolveSpotUserContext(
  args: Pick<SpotCommandArgs, 'wallet' | 'legacyWallet'>,
  out: ReturnType<typeof createOutput>,
): SpotUserContext {
  return resolveMarketUserContext({ wallet: args.wallet ?? args.legacyWallet }, out)
}

export async function loadSpotMarketStateOrExit(
  isTestnet: boolean | undefined,
  out: ReturnType<typeof createOutput>,
): Promise<SpotMarketState> {
  try {
    return await fetchSpotMetaAndAssetCtxs(isTestnet)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return handleCommandError(out, `Failed to fetch spot metadata: ${message}`)
  }
}

export async function loadSpotMetaOrExit(
  isTestnet: boolean | undefined,
  out: ReturnType<typeof createOutput>,
): Promise<SpotMeta> {
  try {
    return await fetchSpotMeta(isTestnet)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return handleCommandError(out, `Failed to fetch spot metadata: ${message}`)
  }
}

export async function loadSpotPairNameSetOrExit(
  isTestnet: boolean | undefined,
  out: ReturnType<typeof createOutput>,
): Promise<Set<string>> {
  const meta = await loadSpotMetaOrExit(isTestnet, out)
  return buildSpotPairNameSet(meta)
}

export async function loadSpotMarketOrExit(
  pair: string,
  isTestnet: boolean | undefined,
  out: ReturnType<typeof createOutput>,
): Promise<HyperliquidSpotMarketAsset> {
  try {
    return await fetchSpotMarketAsset(pair, isTestnet)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return handleCommandError(out, message)
  }
}

export function renderSpotOrderSubmission(args: {
  out: ReturnType<typeof createOutput>
  commandArgs: Pick<SpotCommandArgs, 'json' | 'format'>
  walletName: string
  user: string
  pair: string
  order: ResolvedSpotOrder
  response: OrderResponse
  titlePrefix?: string
}) {
  const { out, commandArgs, walletName, user, pair, order, response, titlePrefix = 'Spot Order' } = args
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
      pair,
      side: order.side,
      size: order.size,
      price: order.price,
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
    title: `${titlePrefix} | ${walletName} | ${pair} ${order.side.toUpperCase()} ${order.size} @ ${order.price}`,
  })
}

export async function runSpotOrderCommand(
  args: {
    pair?: string
    size?: string
    price?: string
    testnet?: boolean
    wallet?: string
    json?: boolean
    format?: string
  },
  side: SpotOrderSide,
): Promise<void> {
  const pair = normalizeSpotPair(String(args.pair))
  const out = resolveSpotOutput(args)
  const { walletName, user } = resolveSpotUserContext(args, out)
  const market = await loadSpotMarketOrExit(pair, args.testnet, out)

  let order: ResolvedSpotOrder
  try {
    order = resolveSpotOrder({
      pair,
      market,
      side,
      size: String(args.size),
      price: args.price ? String(args.price) : undefined,
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

  renderSpotOrderSubmission({
    out,
    commandArgs: args,
    walletName,
    user,
    pair,
    order,
    response,
  })
}
