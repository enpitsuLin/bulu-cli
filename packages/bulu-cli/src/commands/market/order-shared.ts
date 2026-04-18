import type { ExchangeAction, OrderResponse } from '../../protocols/hyperliquid'
import { formatOrderStatus } from '../../protocols/hyperliquid'
import { submitExchangeAction } from './shared'

/**
 * Submit an order action and return formatted status rows.
 * Callers control output.
 */
export async function submitOrder(
  ctx: { walletName: string; testnet?: boolean },
  action: ExchangeAction,
): Promise<{ orderIndex: number; result: string }[]> {
  const response = await submitExchangeAction<OrderResponse>({
    action,
    walletName: ctx.walletName,
    testnet: ctx.testnet,
  })

  return response.response.data.statuses.map((status, idx) => ({
    orderIndex: idx + 1,
    result: formatOrderStatus(status),
  }))
}

/**
 * Build common order args on top of market query args.
 */
export function buildOrderPositionalArgs(
  base: Record<string, unknown>,
  config: {
    symbolName: string
    symbolDesc: string
    sizeDesc: string
    sizeRequired?: boolean
  },
): Record<string, unknown> {
  return {
    ...base,
    [config.symbolName]: {
      type: 'positional',
      description: config.symbolDesc,
      required: true,
    },
    size: {
      type: 'string',
      description: config.sizeDesc,
      required: config.sizeRequired ?? true,
    },
    price: {
      type: 'string',
      description: 'Limit price (omit for market order)',
    },
  }
}
