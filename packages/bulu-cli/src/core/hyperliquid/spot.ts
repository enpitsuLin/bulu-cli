import { createOutput } from '../output'
import { formatTimestamp } from '../time'
import {
  buildSpotPairNameSet,
  fetchSpotMarketAsset,
  fetchSpotMeta,
  fetchSpotMetaAndAssetCtxs,
  normalizeSpotPair,
  resolveSpotOrder,
} from '../../protocols/hyperliquid'
import type {
  AssetCtx,
  FrontendOpenOrder,
  HistoricalOrder,
  HyperliquidSpotMarketAsset,
  ResolvedSpotOrder,
  SpotMeta,
  SpotOrderSide,
  UserFill,
} from '../../protocols/hyperliquid'
import { executeOrExit, loadDataOrExit } from '../../utils/cli'
import { resolveMarketUserContext } from './command'
import { submitOrder } from './order'

export interface SpotCommandArgs {
  wallet?: string
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

export interface SpotOrderCommandResult {
  walletName: string
  pair: string
  side: SpotOrderSide
  order: ResolvedSpotOrder
  statuses: Awaited<ReturnType<typeof submitOrder>>
}

export function resolveSpotUserContext(
  args: Pick<SpotCommandArgs, 'wallet'>,
  out: ReturnType<typeof createOutput>,
): SpotUserContext {
  return resolveMarketUserContext({ wallet: args.wallet }, out)
}

export async function loadSpotMarketStateOrExit(
  isTestnet: boolean | undefined,
  out: ReturnType<typeof createOutput>,
): Promise<SpotMarketState> {
  return loadDataOrExit(out, fetchSpotMetaAndAssetCtxs(isTestnet), 'Failed to fetch spot metadata')
}

export async function loadSpotMetaOrExit(
  isTestnet: boolean | undefined,
  out: ReturnType<typeof createOutput>,
): Promise<SpotMeta> {
  return loadDataOrExit(out, fetchSpotMeta(isTestnet), 'Failed to fetch spot metadata')
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
  return loadDataOrExit(out, fetchSpotMarketAsset(pair, isTestnet), 'Failed to load spot market')
}

export async function executeSpotOrderCommand(
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
  out: ReturnType<typeof createOutput>,
): Promise<SpotOrderCommandResult> {
  const pair = normalizeSpotPair(String(args.pair))
  const { walletName } = resolveSpotUserContext(args, out)
  const market = await loadSpotMarketOrExit(pair, args.testnet, out)

  const order: ResolvedSpotOrder = executeOrExit(
    out,
    () =>
      resolveSpotOrder({
        pair,
        market,
        side,
        size: String(args.size),
        price: args.price ? String(args.price) : undefined,
      }),
    'Failed to resolve order',
  )

  const statuses = await submitOrder({ walletName, testnet: args.testnet }, order.action)

  return {
    walletName,
    pair,
    side,
    order,
    statuses,
  }
}

export function renderSpotOrderResult(result: SpotOrderCommandResult, out: ReturnType<typeof createOutput>): void {
  out.table(result.statuses, {
    columns: ['orderIndex', 'result'],
    title: `Spot Order | ${result.walletName} | ${result.pair} ${result.side.toUpperCase()} ${result.order.size} @ ${result.order.price}`,
  })
}

function resolveSpotSide(side: FrontendOpenOrder['side'] | UserFill['side']): 'buy' | 'sell' {
  return side === 'B' ? 'buy' : 'sell'
}

function formatTif(tif: string, isTrigger: boolean): string {
  if (isTrigger) return `trigger (${tif})`
  return tif
}

export function formatSpotOpenOrderRow(order: FrontendOpenOrder) {
  return {
    pair: order.coin,
    side: resolveSpotSide(order.side),
    size: order.sz,
    origSize: order.origSz,
    limitPx: order.limitPx,
    tif: formatTif(order.tif, order.isTrigger),
    triggerPx: order.triggerPx ?? 'N/A',
    reduceOnly: order.reduceOnly,
    oid: order.oid,
    cloid: order.cloid ?? 'N/A',
    timestamp: formatTimestamp(order.timestamp),
  }
}

export function formatSpotHistoryOrderRow(entry: HistoricalOrder) {
  return {
    pair: entry.order.coin,
    status: entry.status,
    side: resolveSpotSide(entry.order.side),
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

export function formatSpotFillRow(fill: UserFill) {
  return {
    time: formatTimestamp(fill.time),
    pair: fill.coin,
    dir: fill.dir ?? 'N/A',
    side: resolveSpotSide(fill.side),
    size: fill.sz,
    price: fill.px,
    fee: fill.fee ?? 'N/A',
    closedPnl: fill.closedPnl ?? 'N/A',
    oid: fill.oid,
  }
}
