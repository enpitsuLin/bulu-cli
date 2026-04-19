import { createOutput, resolveOutputOptions } from '../../../core/output'
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

  const detail = order.isTrigger
    ? `${coin} ${String(order.triggerKind).toUpperCase()} ${order.size} trigger ${order.triggerPx} -> ${order.price}`
    : `${coin} ${order.side.toUpperCase()} ${order.size} @ ${order.price}`

  const statuses = await submitOrder({ walletName, testnet: args.testnet }, order.action)

  out.table(statuses, {
    columns: ['orderIndex', 'result'],
    title: `Perp Order | ${walletName} | ${detail}`,
  })
}
