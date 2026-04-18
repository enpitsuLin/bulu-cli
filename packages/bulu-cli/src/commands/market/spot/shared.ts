import { createOutput, resolveOutputOptions } from '../../../core/output'
import {
  buildSpotPairNameSet,
  fetchSpotMarketAsset,
  fetchSpotMeta,
  fetchSpotMetaAndAssetCtxs,
  normalizeSpotPair,
  resolveSpotOrder,
} from '../../../protocols/hyperliquid'
import type {
  AssetCtx,
  HyperliquidSpotMarketAsset,
  ResolvedSpotOrder,
  SpotMeta,
  SpotOrderSide,
} from '../../../protocols/hyperliquid'
import { resolveMarketQueryArgs, resolveMarketUserContext } from '../shared'
import { executeOrExit, loadDataOrExit } from '../../../utils/cli'
import { buildOrderPositionalArgs, submitOrderAndRender } from '../order-shared'
import type { OrderSubmissionContext } from '../order-shared'

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
  return resolveSpotQueryArgs(
    buildOrderPositionalArgs(
      {},
      {
        symbolName: 'pair',
        symbolDesc: 'Exact Hyperliquid spot pair, e.g. PURR/USDC, UBTC/USDC, @107',
        sizeDesc: 'Order size in base asset units',
      },
    ),
  )
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
  const out = createOutput(resolveOutputOptions(args))
  const { walletName, user } = resolveSpotUserContext(args, out)
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

  const ctx: OrderSubmissionContext = {
    out,
    commandArgs: args,
    walletName,
    user,
    testnet: args.testnet,
  }

  await submitOrderAndRender(ctx, order.action, {
    detail: `${pair} ${side.toUpperCase()} ${order.size} @ ${order.price}`,
    titlePrefix: 'Spot Order',
    jsonData: {
      wallet: walletName,
      user,
      pair,
      side: order.side,
      size: order.size,
      price: order.price,
    },
  })
}
