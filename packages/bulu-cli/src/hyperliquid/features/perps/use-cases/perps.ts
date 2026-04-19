import { findMarketAsset } from '../../../domain/market/assets'
import { isSpotPairName } from '../../../domain/market/spot'
import {
  buildCancelAction,
  buildModifyAction,
  buildOrderWire,
  buildScheduleCancelAction,
  buildUpdateIsolatedMarginAction,
  buildUpdateLeverageAction,
} from '../../../domain/orders/actions'
import { parseOrderIdentifier } from '../../../domain/orders/identifiers'
import { findOrderByIdentifier } from '../../../domain/orders/selectors'
import {
  resolveOrderTimeInForce,
  resolvePerpOrder,
  resolvePerpTpslOrder,
  resolveTriggerKindFromOrder,
} from '../../../domain/orders/resolve'
import type {
  ClearinghouseState,
  HyperliquidMarketAsset,
  OrderResponse,
  ResolvedPerpOrder,
} from '../../../domain/types'
import {
  fetchClearinghouseState,
  fetchFrontendOpenOrders,
  fetchHistoricalOrders,
  fetchMetaAndAssetCtxs,
  fetchOrderStatus,
  fetchSpotMeta,
  fetchUserFills,
  fetchUserFillsByTime,
} from '../../../gateway/info'
import { type HyperliquidWalletContext, submitExchangeAction } from '../../../shared/context'
import { parseLimitArg, parseTimeArg } from '../../../shared/args'
import { fail, wrapAsync, wrapSync } from '../../../shared/errors'
import {
  type PerpCancelResult,
  type PerpFillsResult,
  type PerpHistoryResult,
  type PerpModifyResult,
  type PerpOrderResult,
  type PerpOrdersResult,
  type PerpPositionsResult,
  type PerpStatusResult,
  type ScheduledCancelResult,
  type SubmittedOrderStatusRow,
  type UpdatedPerpLeverageResult,
  type UpdatedPerpMarginResult,
  mapSubmittedStatuses,
} from '../presenters/perps'
import { isMarketTrigger, partitionPerpEntries, selectPerpOrders, splitPerpAndSpotOrders } from '../selectors/perps'

interface PerpsDeps {
  fetchClearinghouseState: typeof fetchClearinghouseState
  fetchFrontendOpenOrders: typeof fetchFrontendOpenOrders
  fetchHistoricalOrders: typeof fetchHistoricalOrders
  fetchMetaAndAssetCtxs: typeof fetchMetaAndAssetCtxs
  fetchOrderStatus: typeof fetchOrderStatus
  fetchSpotMeta: typeof fetchSpotMeta
  fetchUserFills: typeof fetchUserFills
  fetchUserFillsByTime: typeof fetchUserFillsByTime
  submitExchangeAction: typeof submitExchangeAction
}

const defaultDeps: PerpsDeps = {
  fetchClearinghouseState,
  fetchFrontendOpenOrders,
  fetchHistoricalOrders,
  fetchMetaAndAssetCtxs,
  fetchOrderStatus,
  fetchSpotMeta,
  fetchUserFills,
  fetchUserFillsByTime,
  submitExchangeAction,
}

async function fetchPerpMarketAsset(
  coin: string,
  isTestnet: boolean,
  deps: PerpsDeps,
): Promise<HyperliquidMarketAsset> {
  const market = await wrapAsync(deps.fetchMetaAndAssetCtxs(isTestnet), 'Failed to load perp market')
  return wrapSync(() => findMarketAsset(coin, market), 'Failed to load perp market')
}

async function fetchPerpState(user: string, isTestnet: boolean, deps: PerpsDeps): Promise<ClearinghouseState> {
  return wrapAsync(deps.fetchClearinghouseState(user, isTestnet), 'Failed to fetch positions')
}

async function submitOrderStatuses(
  ctx: HyperliquidWalletContext,
  action: ResolvedPerpOrder['action'],
  deps: PerpsDeps,
): Promise<SubmittedOrderStatusRow[]> {
  const response = await wrapAsync(deps.submitExchangeAction<OrderResponse>(ctx, action), 'Failed to submit order')
  return mapSubmittedStatuses(response)
}

function parseLeverage(value: string): number {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid leverage: ${value}`)
  }
  return parsed
}

function parseScaledUsdDelta(value: string): number {
  const trimmed = value.trim()
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid margin delta: ${value}`)
  }

  const sign = trimmed.startsWith('-') ? -1 : 1
  const unsigned = sign === -1 ? trimmed.slice(1) : trimmed
  const [whole, frac = ''] = unsigned.split('.')
  const paddedFrac = (frac + '000000').slice(0, 6)
  const scaled = Number(whole) * 1_000_000 + Number(paddedFrac)

  if (!Number.isSafeInteger(scaled) || scaled === 0) {
    throw new Error(`Invalid margin delta: ${value}`)
  }

  return sign * scaled
}

export async function placePerpOrder(
  ctx: HyperliquidWalletContext,
  input: {
    coin?: string
    size?: string
    price?: string
    side?: 'long' | 'short'
    close?: boolean
  },
  deps: PerpsDeps = defaultDeps,
): Promise<PerpOrderResult> {
  const coin = String(input.coin).toUpperCase()
  const market = await fetchPerpMarketAsset(coin, ctx.testnet, deps)
  const state = input.close ? await fetchPerpState(ctx.user, ctx.testnet, deps) : undefined
  const order = wrapSync(
    () =>
      resolvePerpOrder({
        coin,
        market,
        side: input.side,
        size: input.size ? String(input.size) : undefined,
        price: input.price ? String(input.price) : undefined,
        close: input.close === true,
        state,
      }),
    'Failed to resolve order',
  )
  const statuses = await submitOrderStatuses(ctx, order.action, deps)

  return {
    walletName: ctx.walletName,
    coin,
    order,
    statuses,
  }
}

export async function placePerpTpsl(
  ctx: HyperliquidWalletContext,
  input: {
    coin?: string
    trigger?: string
    size?: string
    price?: string
    tpsl: 'tp' | 'sl'
  },
  deps: PerpsDeps = defaultDeps,
): Promise<PerpOrderResult> {
  const coin = String(input.coin).toUpperCase()
  const market = await fetchPerpMarketAsset(coin, ctx.testnet, deps)
  const state = await fetchPerpState(ctx.user, ctx.testnet, deps)
  const order = wrapSync(
    () =>
      resolvePerpTpslOrder({
        coin,
        market,
        triggerPrice: String(input.trigger),
        price: input.price ? String(input.price) : undefined,
        size: input.size ? String(input.size) : undefined,
        state,
        tpsl: input.tpsl,
      }),
    'Failed to resolve order',
  )
  const statuses = await submitOrderStatuses(ctx, order.action, deps)

  return {
    walletName: ctx.walletName,
    coin,
    order,
    statuses,
  }
}

export async function listPerpOrders(
  ctx: HyperliquidWalletContext,
  input: { coin?: string },
  deps: PerpsDeps = defaultDeps,
): Promise<PerpOrdersResult> {
  const coinFilter = input.coin ? String(input.coin).toUpperCase() : undefined
  const [orders, spotMeta] = await wrapAsync(
    Promise.all([deps.fetchFrontendOpenOrders(ctx.user, ctx.testnet), deps.fetchSpotMeta(ctx.testnet)]),
    'Failed to fetch data',
  )

  const perps = partitionPerpEntries(orders, spotMeta)
  return {
    walletName: ctx.walletName,
    user: ctx.user,
    orders: coinFilter ? perps.filter((order) => order.coin === coinFilter) : perps,
  }
}

export async function listPerpHistory(
  ctx: HyperliquidWalletContext,
  input: { coin?: string; status?: string; limit?: string },
  deps: PerpsDeps = defaultDeps,
): Promise<PerpHistoryResult> {
  const coin = input.coin ? String(input.coin).toUpperCase() : undefined
  const status = input.status ? String(input.status).toLowerCase() : undefined
  const limit = parseLimitArg(input.limit ? String(input.limit) : undefined)
  const [history, spotMeta] = await wrapAsync(
    Promise.all([deps.fetchHistoricalOrders(ctx.user, ctx.testnet), deps.fetchSpotMeta(ctx.testnet)]),
    'Failed to fetch data',
  )

  const perps = partitionPerpEntries(
    history.map((entry) => ({ coin: entry.order.coin, entry })),
    spotMeta,
  )
    .map(({ entry }) => entry)
    .filter((entry) => {
      if (coin && entry.order.coin !== coin) return false
      if (status && entry.status.toLowerCase() !== status) return false
      return true
    })
    .slice(0, limit)

  return {
    walletName: ctx.walletName,
    user: ctx.user,
    entries: perps,
  }
}

export async function listPerpFills(
  ctx: HyperliquidWalletContext,
  input: {
    coin?: string
    since?: string
    until?: string
    limit?: string
    aggregateByTime?: boolean
  },
  deps: PerpsDeps = defaultDeps,
): Promise<PerpFillsResult> {
  const coin = input.coin ? String(input.coin).toUpperCase() : undefined
  const limit = parseLimitArg(input.limit ? String(input.limit) : undefined)
  const aggregateByTime = input.aggregateByTime === true

  const [fills, spotMeta] = await wrapAsync(
    Promise.all([
      input.since || input.until
        ? deps.fetchUserFillsByTime({
            user: ctx.user,
            startTime: parseTimeArg(String(input.since ?? '0'), 'since'),
            endTime: input.until ? parseTimeArg(String(input.until), 'until') : undefined,
            aggregateByTime,
            isTestnet: ctx.testnet,
          })
        : deps.fetchUserFills(ctx.user, aggregateByTime, ctx.testnet),
      deps.fetchSpotMeta(ctx.testnet),
    ]),
    'Failed to fetch data',
  )

  const perps = partitionPerpEntries(fills, spotMeta)
    .filter((fill) => (coin ? fill.coin === coin : true))
    .slice(0, limit)

  return {
    walletName: ctx.walletName,
    user: ctx.user,
    fills: perps,
  }
}

export async function listPerpPositions(
  ctx: HyperliquidWalletContext,
  deps: PerpsDeps = defaultDeps,
): Promise<PerpPositionsResult> {
  const state = await fetchPerpState(ctx.user, ctx.testnet, deps)

  return {
    walletName: ctx.walletName,
    user: ctx.user,
    positions: state.assetPositions.map((assetPosition) => assetPosition.position),
  }
}

export async function getPerpOrderStatus(
  ctx: HyperliquidWalletContext,
  input: { id?: string },
  deps: PerpsDeps = defaultDeps,
): Promise<PerpStatusResult> {
  const id = String(input.id)
  const [response, spotMeta] = await wrapAsync(
    Promise.all([
      deps.fetchOrderStatus({
        user: ctx.user,
        oid: wrapSync(() => parseOrderIdentifier(id), 'Failed to parse order id'),
        isTestnet: ctx.testnet,
      }),
      deps.fetchSpotMeta(ctx.testnet),
    ]),
    'Failed to fetch order status',
  )

  if (response && typeof response === 'object' && 'order' in response && response.order) {
    if (isSpotPairName(response.order.coin, spotMeta)) {
      fail(`Order ${id} belongs to spot; use \`bulu market spot orders\` or \`bulu market spot history\``)
    }
  }

  return {
    walletName: ctx.walletName,
    user: ctx.user,
    response,
  }
}

export async function cancelPerpOrders(
  ctx: HyperliquidWalletContext,
  input: { id?: string; coin?: string; all?: boolean },
  deps: PerpsDeps = defaultDeps,
): Promise<PerpCancelResult> {
  const coinFilter = input.coin ? String(input.coin).toUpperCase() : undefined
  const all = input.all === true

  if (!all && !input.id) {
    fail('Provide an order id or use --all')
  }

  const [orders, spotMeta] = await wrapAsync(
    Promise.all([deps.fetchFrontendOpenOrders(ctx.user, ctx.testnet), deps.fetchSpotMeta(ctx.testnet)]),
    'Failed to fetch open orders',
  )
  const { perps, spot } = splitPerpAndSpotOrders(orders, spotMeta)
  const { selected, spotMatch } = selectPerpOrders({
    orders: perps,
    spotOrders: spot,
    id: input.id ? String(input.id) : undefined,
    coinFilter,
    all,
  })

  if (selected.length === 0) {
    if (spotMatch) {
      fail(`Order ${input.id} belongs to spot; use \`bulu market spot cancel\``)
    }

    fail(all ? 'No matching open orders to cancel' : `Order not found: ${input.id}`)
  }

  const marketByCoin = new Map<string, HyperliquidMarketAsset>()
  for (const coin of new Set(selected.map((order) => order.coin))) {
    marketByCoin.set(coin, await fetchPerpMarketAsset(coin, ctx.testnet, deps))
  }

  await wrapAsync(
    deps.submitExchangeAction(
      ctx,
      buildCancelAction(
        selected.map((order) => ({
          a: marketByCoin.get(order.coin)!.assetIndex,
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

export async function modifyPerpOrder(
  ctx: HyperliquidWalletContext,
  input: {
    id?: string
    price?: string
    size?: string
    trigger?: string
    tp?: boolean
    sl?: boolean
  },
  deps: PerpsDeps = defaultDeps,
): Promise<PerpModifyResult> {
  if (!input.price && !input.size && !input.trigger && !input.tp && !input.sl) {
    fail('Provide at least one of --price, --size, --trigger, --tp, or --sl')
  }

  const [orders, spotMeta] = await wrapAsync(
    Promise.all([deps.fetchFrontendOpenOrders(ctx.user, ctx.testnet), deps.fetchSpotMeta(ctx.testnet)]),
    'Failed to fetch open orders',
  )
  const { perps, spot } = splitPerpAndSpotOrders(orders, spotMeta)
  const orderId = String(input.id)
  const currentOrder = findOrderByIdentifier(perps, orderId)
  const matchedSpotOrder = findOrderByIdentifier(spot, orderId)

  if (!currentOrder) {
    if (matchedSpotOrder) {
      fail(`Order ${orderId} belongs to spot; use \`bulu market spot cancel\` and place a new spot order`)
    }

    fail(`Order not found: ${orderId}`)
  }

  const market = await fetchPerpMarketAsset(currentOrder.coin, ctx.testnet, deps)
  const triggerKind = currentOrder.isTrigger
    ? wrapSync(
        () => resolveTriggerKindFromOrder(currentOrder, input.tp ? 'tp' : input.sl ? 'sl' : undefined),
        'Failed to modify order',
      )
    : undefined

  const wire = wrapSync(
    () =>
      buildOrderWire({
        assetIndex: market.assetIndex,
        isBuy: currentOrder.side === 'B',
        size: input.size ? String(input.size) : currentOrder.sz,
        price: input.price
          ? String(input.price)
          : currentOrder.isTrigger && isMarketTrigger(currentOrder)
            ? (currentOrder.triggerPx ?? currentOrder.limitPx)
            : currentOrder.limitPx,
        reduceOnly: currentOrder.reduceOnly,
        tif: currentOrder.isTrigger ? undefined : resolveOrderTimeInForce(currentOrder),
        trigger: currentOrder.isTrigger
          ? {
              isMarket: input.price ? false : isMarketTrigger(currentOrder),
              triggerPx: input.trigger ? String(input.trigger) : (currentOrder.triggerPx ?? currentOrder.limitPx),
              tpsl: triggerKind!,
            }
          : undefined,
        cloid: currentOrder.cloid ?? undefined,
      }),
    'Failed to modify order',
  )

  await wrapAsync(
    deps.submitExchangeAction(
      ctx,
      buildModifyAction({
        oid: currentOrder.cloid ?? currentOrder.oid,
        order: wire,
      }),
    ),
    'Failed to modify order',
  )

  return {
    walletName: ctx.walletName,
    user: ctx.user,
    currentOrder,
    wire,
  }
}

export async function updatePerpLeverage(
  ctx: HyperliquidWalletContext,
  input: { coin?: string; value?: string; isolated?: boolean },
  deps: PerpsDeps = defaultDeps,
): Promise<UpdatedPerpLeverageResult> {
  const coin = String(input.coin).toUpperCase()
  const market = await fetchPerpMarketAsset(coin, ctx.testnet, deps)
  const leverage = wrapSync(() => parseLeverage(String(input.value)), 'Invalid leverage')

  await wrapAsync(
    deps.submitExchangeAction(
      ctx,
      buildUpdateLeverageAction({
        asset: market.assetIndex,
        leverage,
        isCross: input.isolated !== true,
      }),
    ),
    'Failed to update leverage',
  )

  return {
    walletName: ctx.walletName,
    user: ctx.user,
    coin,
    leverage,
    isolated: input.isolated === true,
  }
}

export async function updatePerpMargin(
  ctx: HyperliquidWalletContext,
  input: { coin?: string; delta?: string },
  deps: PerpsDeps = defaultDeps,
): Promise<UpdatedPerpMarginResult> {
  const coin = String(input.coin).toUpperCase()
  const market = await fetchPerpMarketAsset(coin, ctx.testnet, deps)
  const ntli = wrapSync(() => parseScaledUsdDelta(String(input.delta)), 'Invalid margin delta')

  await wrapAsync(
    deps.submitExchangeAction(
      ctx,
      buildUpdateIsolatedMarginAction({
        asset: market.assetIndex,
        ntli,
      }),
    ),
    'Failed to update isolated margin',
  )

  return {
    walletName: ctx.walletName,
    user: ctx.user,
    coin,
    delta: String(input.delta),
    ntli,
  }
}

export async function updatePerpScheduleCancel(
  ctx: HyperliquidWalletContext,
  input: { at?: string; clear?: boolean },
  deps: PerpsDeps = defaultDeps,
): Promise<ScheduledCancelResult> {
  if (input.clear && input.at) {
    fail('Use either --clear or --at, not both')
  }

  if (!input.clear && !input.at) {
    fail('Provide --at to schedule a cancel or --clear to remove it')
  }

  const scheduledTime = input.at
    ? wrapSync(() => parseTimeArg(String(input.at), 'schedule time'), 'Invalid time')
    : undefined

  await wrapAsync(
    deps.submitExchangeAction(ctx, buildScheduleCancelAction(input.clear ? undefined : scheduledTime)),
    'Failed to update scheduled cancel',
  )

  return {
    walletName: ctx.walletName,
    user: ctx.user,
    cleared: input.clear === true,
    scheduledTime,
  }
}
