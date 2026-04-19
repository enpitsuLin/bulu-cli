import { formatOrderStatus } from '../../protocols/hyperliquid'
import type { ExchangeAction, OrderResponse } from '../../protocols/hyperliquid'
import { submitExchangeAction } from './command'

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
