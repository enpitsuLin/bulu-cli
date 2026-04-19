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
import { resolveMarketUserContext } from '../shared'
import { executeOrExit, loadDataOrExit } from '../../../utils/cli'
import { submitOrder } from '../order-shared'

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
  const { walletName, user: _user } = resolveSpotUserContext(args, out)
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

  out.table(statuses, {
    columns: ['orderIndex', 'result'],
    title: `Spot Order | ${walletName} | ${pair} ${side.toUpperCase()} ${order.size} @ ${order.price}`,
  })
}
