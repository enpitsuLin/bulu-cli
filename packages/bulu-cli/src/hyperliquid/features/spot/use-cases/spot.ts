import { findSpotMarketAsset } from '../../../domain/market/assets'
import { normalizeSpotPair } from '../../../domain/market/spot'
import { buildCancelAction } from '../../../domain/orders/actions'
import { resolveSpotOrder } from '../../../domain/orders/resolve'
import type { FrontendOpenOrder, OrderResponse } from '../../../domain/types'
import {
  fetchFrontendOpenOrders,
  fetchHistoricalOrders,
  fetchSpotClearinghouseState,
  fetchSpotMeta,
  fetchSpotMetaAndAssetCtxs,
  fetchUserFills,
  fetchUserFillsByTime,
} from '../../../gateway/info'
import { type HyperliquidWalletContext, submitExchangeAction } from '../../../shared/context'
import { parseLimitArg, parseTimeArg } from '../../../shared/args'
import { fail, wrapAsync, wrapSync } from '../../../shared/errors'
import { mapSubmittedStatuses } from '../../perps/presenters/perps'
import type {
  SpotCancelResult,
  SpotFillsResult,
  SpotHistoryResult,
  SpotOrderResult,
  SpotOrdersResult,
  SpotPairsResult,
  SpotPositionsResult,
} from '../presenters/spot'
import { partitionSpotEntries, selectSpotOrders } from '../selectors/spot'

interface SpotDeps {
  fetchFrontendOpenOrders: typeof fetchFrontendOpenOrders
  fetchHistoricalOrders: typeof fetchHistoricalOrders
  fetchSpotClearinghouseState: typeof fetchSpotClearinghouseState
  fetchSpotMeta: typeof fetchSpotMeta
  fetchSpotMetaAndAssetCtxs: typeof fetchSpotMetaAndAssetCtxs
  fetchUserFills: typeof fetchUserFills
  fetchUserFillsByTime: typeof fetchUserFillsByTime
  submitExchangeAction: typeof submitExchangeAction
}

const defaultDeps: SpotDeps = {
  fetchFrontendOpenOrders,
  fetchHistoricalOrders,
  fetchSpotClearinghouseState,
  fetchSpotMeta,
  fetchSpotMetaAndAssetCtxs,
  fetchUserFills,
  fetchUserFillsByTime,
  submitExchangeAction,
}

async function fetchSpotMarketAsset(pair: string, isTestnet: boolean, deps: SpotDeps) {
  const market = await wrapAsync(deps.fetchSpotMetaAndAssetCtxs(isTestnet), 'Failed to load spot market')
  return wrapSync(() => findSpotMarketAsset(pair, market), 'Failed to load spot market')
}

export async function placeSpotOrder(
  ctx: HyperliquidWalletContext,
  input: { pair?: string; size?: string; price?: string; side: 'buy' | 'sell' },
  deps: SpotDeps = defaultDeps,
): Promise<SpotOrderResult> {
  const pair = normalizeSpotPair(String(input.pair))
  const market = await fetchSpotMarketAsset(pair, ctx.testnet, deps)
  const order = wrapSync(
    () =>
      resolveSpotOrder({
        pair,
        market,
        side: input.side,
        size: String(input.size),
        price: input.price ? String(input.price) : undefined,
      }),
    'Failed to resolve order',
  )

  const response = await wrapAsync(
    deps.submitExchangeAction<OrderResponse>(ctx, order.action),
    'Failed to submit order',
  )

  return {
    walletName: ctx.walletName,
    pair,
    side: input.side,
    order,
    statuses: mapSubmittedStatuses(response),
  }
}

export async function listSpotOrders(
  ctx: HyperliquidWalletContext,
  input: { pair?: string },
  deps: SpotDeps = defaultDeps,
): Promise<SpotOrdersResult> {
  const pairFilter = input.pair ? normalizeSpotPair(String(input.pair)) : undefined
  const [orders, spotMeta] = await wrapAsync(
    Promise.all([deps.fetchFrontendOpenOrders(ctx.user, ctx.testnet), deps.fetchSpotMeta(ctx.testnet)]),
    'Failed to fetch data',
  )

  const spot = partitionSpotEntries(orders, spotMeta)
  return {
    walletName: ctx.walletName,
    user: ctx.user,
    orders: pairFilter ? spot.filter((order) => order.coin === pairFilter) : spot,
  }
}

export async function listSpotHistory(
  ctx: HyperliquidWalletContext,
  input: { pair?: string; status?: string; limit?: string },
  deps: SpotDeps = defaultDeps,
): Promise<SpotHistoryResult> {
  const pairFilter = input.pair ? normalizeSpotPair(String(input.pair)) : undefined
  const status = input.status ? String(input.status).toLowerCase() : undefined
  const limit = parseLimitArg(input.limit ? String(input.limit) : undefined)
  const history = await wrapAsync(deps.fetchHistoricalOrders(ctx.user, ctx.testnet), 'Failed to fetch data')
  const spotPairs = await wrapAsync(deps.fetchSpotMeta(ctx.testnet), 'Failed to fetch data')

  const spot = partitionSpotEntries(
    history.map((entry) => ({ coin: entry.order.coin, entry })),
    spotPairs,
  )
    .map(({ entry }) => entry)
    .filter((entry) => {
      if (pairFilter && entry.order.coin !== pairFilter) return false
      if (status && entry.status.toLowerCase() !== status) return false
      return true
    })
    .slice(0, limit)

  return {
    walletName: ctx.walletName,
    user: ctx.user,
    entries: spot,
  }
}

export async function listSpotFills(
  ctx: HyperliquidWalletContext,
  input: { pair?: string; since?: string; until?: string; limit?: string; aggregateByTime?: boolean },
  deps: SpotDeps = defaultDeps,
): Promise<SpotFillsResult> {
  const pairFilter = input.pair ? normalizeSpotPair(String(input.pair)) : undefined
  const limit = parseLimitArg(input.limit ? String(input.limit) : undefined)
  const aggregateByTime = input.aggregateByTime === true
  const fills = await wrapAsync(
    input.since || input.until
      ? deps.fetchUserFillsByTime({
          user: ctx.user,
          startTime: parseTimeArg(String(input.since ?? '0'), 'since'),
          endTime: input.until ? parseTimeArg(String(input.until), 'until') : undefined,
          aggregateByTime,
          isTestnet: ctx.testnet,
        })
      : deps.fetchUserFills(ctx.user, aggregateByTime, ctx.testnet),
    'Failed to fetch data',
  )
  const spotPairs = await wrapAsync(deps.fetchSpotMeta(ctx.testnet), 'Failed to fetch data')
  const spot = partitionSpotEntries(fills, spotPairs)
    .filter((fill) => (pairFilter ? fill.coin === pairFilter : true))
    .slice(0, limit)

  return {
    walletName: ctx.walletName,
    user: ctx.user,
    fills: spot,
  }
}

export async function cancelSpotOrders(
  ctx: HyperliquidWalletContext,
  input: { id?: string; pair?: string; all?: boolean },
  deps: SpotDeps = defaultDeps,
): Promise<SpotCancelResult> {
  const pairFilter = input.pair ? normalizeSpotPair(String(input.pair)) : undefined
  const all = input.all === true

  if (!all && !input.id) {
    fail('Provide an order id or use --all')
  }

  const [spotMarket, orders] = await wrapAsync(
    Promise.all([deps.fetchSpotMetaAndAssetCtxs(ctx.testnet), deps.fetchFrontendOpenOrders(ctx.user, ctx.testnet)]),
    'Failed to fetch open orders',
  )
  const spot = partitionSpotEntries(orders, spotMarket.meta)
  const selected = selectSpotOrders({
    orders: spot,
    id: input.id ? String(input.id) : undefined,
    pairFilter,
    all,
  })

  if (selected.length === 0) {
    fail(all ? 'No matching open spot orders to cancel' : `Spot order not found: ${input.id}`)
  }

  await wrapAsync(
    deps.submitExchangeAction(
      ctx,
      buildCancelAction(
        selected.map((order: FrontendOpenOrder) => ({
          a: findSpotMarketAsset(order.coin, spotMarket).assetIndex,
          o: order.oid,
        })),
      ),
    ),
    'Failed to cancel order',
  )

  return {
    walletName: ctx.walletName,
    user: ctx.user,
    orders: selected,
  }
}

export async function listSpotPositions(
  ctx: HyperliquidWalletContext,
  deps: SpotDeps = defaultDeps,
): Promise<SpotPositionsResult> {
  const state = await wrapAsync(
    deps.fetchSpotClearinghouseState(ctx.user, ctx.testnet),
    'Failed to fetch spot balances',
  )

  return {
    walletName: ctx.walletName,
    user: ctx.user,
    balances: state.balances || [],
  }
}

export async function listSpotPairs(testnet: boolean, deps: SpotDeps = defaultDeps): Promise<SpotPairsResult> {
  const market = await wrapAsync(deps.fetchSpotMetaAndAssetCtxs(testnet), 'Failed to fetch spot metadata')
  return {
    meta: market.meta,
    contexts: market.contexts as Array<Record<string, unknown>>,
  }
}
