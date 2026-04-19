import { createOutput } from '../output'
import { formatTimestamp } from '../time'
import {
  fetchClearinghouseState,
  fetchMarketAsset,
  resolveOrderSide,
  resolvePerpOrder,
} from '../../protocols/hyperliquid'
import type {
  ClearinghouseState,
  FrontendOpenOrder,
  HistoricalOrder,
  HyperliquidMarketAsset,
  OrderSide,
  ResolvedPerpOrder,
  UserFill,
} from '../../protocols/hyperliquid'
import { executeOrExit, loadDataOrExit, handleCommandError } from '../../utils/cli'
import { resolveMarketUserContext, submitExchangeAction } from './command'
import { submitOrder } from './order'

export { handleCommandError, submitExchangeAction }

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

export interface PerpOrderCommandResult {
  walletName: string
  coin: string
  order: ResolvedPerpOrder
  statuses: Awaited<ReturnType<typeof submitOrder>>
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
  return loadDataOrExit(out, fetchMarketAsset(coin, isTestnet), 'Failed to load perp market')
}

export async function loadPerpStateOrExit(
  user: string,
  isTestnet: boolean | undefined,
  out: ReturnType<typeof createOutput>,
): Promise<ClearinghouseState> {
  return loadDataOrExit(out, fetchClearinghouseState(user, isTestnet), 'Failed to fetch positions')
}

export async function executePerpOrderCommand(
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
  out: ReturnType<typeof createOutput>,
): Promise<PerpOrderCommandResult> {
  const coin = String(args.coin).toUpperCase()
  const { walletName, user } = resolvePerpUserContext(args, out)
  const market = await loadPerpMarketOrExit(coin, args.testnet, out)

  const state = preset.close ? await loadPerpStateOrExit(user, args.testnet, out) : undefined

  const order: ResolvedPerpOrder = executeOrExit(
    out,
    () =>
      resolvePerpOrder({
        coin,
        market,
        side: preset.side,
        size: args.size ? String(args.size) : undefined,
        price: args.price ? String(args.price) : undefined,
        close: preset.close,
        state,
      }),
    'Failed to resolve order',
  )

  const statuses = await submitOrder({ walletName, testnet: args.testnet }, order.action)

  return {
    walletName,
    coin,
    order,
    statuses,
  }
}

export function renderPerpOrderResult(result: PerpOrderCommandResult, out: ReturnType<typeof createOutput>): void {
  const detail = result.order.isTrigger
    ? `${result.coin} ${String(result.order.triggerKind).toUpperCase()} ${result.order.size} trigger ${result.order.triggerPx} -> ${result.order.price}`
    : `${result.coin} ${result.order.side.toUpperCase()} ${result.order.size} @ ${result.order.price}`

  out.table(result.statuses, {
    columns: ['orderIndex', 'result'],
    title: `Perp Order | ${result.walletName} | ${detail}`,
  })
}

function formatTif(tif: string, isTrigger: boolean): string {
  if (isTrigger) return `trigger (${tif})`
  return tif
}

export function formatPerpOpenOrderRow(order: FrontendOpenOrder) {
  return {
    coin: order.coin,
    side: resolveOrderSide(order.side),
    size: order.sz,
    origSize: order.origSz,
    limitPx: order.limitPx,
    tif: formatTif(order.tif, order.isTrigger),
    triggerPx: order.triggerPx ?? 'N/A',
    cloid: order.cloid ?? 'N/A',
    positionTpsl: order.isPositionTpsl ?? false,
    reduceOnly: order.reduceOnly,
    oid: order.oid,
    timestamp: formatTimestamp(order.timestamp),
  }
}

export function formatHistoryOrderRow(entry: HistoricalOrder) {
  return {
    coin: entry.order.coin,
    status: entry.status,
    side: entry.order.side === 'B' ? 'long' : 'short',
    size: entry.order.sz,
    origSize: entry.order.origSz,
    limitPx: entry.order.limitPx,
    tif: entry.order.tif,
    reduceOnly: entry.order.reduceOnly,
    oid: entry.order.oid,
    cloid: entry.order.cloid ?? 'N/A',
    statusTimestamp: formatTimestamp(entry.statusTimestamp),
  }
}

export function formatPerpFillRow(fill: UserFill) {
  return {
    time: formatTimestamp(fill.time),
    coin: fill.coin,
    dir: fill.dir ?? 'N/A',
    side: resolveOrderSide(fill.side),
    size: fill.sz,
    price: fill.px,
    fee: fill.fee ?? 'N/A',
    closedPnl: fill.closedPnl ?? 'N/A',
    oid: fill.oid,
  }
}
