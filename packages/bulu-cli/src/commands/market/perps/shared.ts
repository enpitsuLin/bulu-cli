import { createOutput } from '../../../core/output'
import { fetchClearinghouseState, fetchMarketAsset, resolvePerpOrder } from '../../../protocols/hyperliquid'
import type {
  ClearinghouseState,
  HyperliquidMarketAsset,
  OrderSide,
  ResolvedPerpOrder,
} from '../../../protocols/hyperliquid'
import { resolveMarketUserContext } from '../shared'
import { executeOrExit, loadDataOrExit } from '../../../utils/cli'
import { submitOrder } from '../order-shared'

export { handleCommandError } from '../../../utils/cli'
export { submitExchangeAction } from '../shared'

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
