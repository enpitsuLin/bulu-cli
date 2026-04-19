import type { AssetPosition, ClearinghouseState, FrontendOpenOrder } from '../types'
import { parseOrderIdentifier } from './identifiers'

export function findOrderByIdentifier(
  orders: FrontendOpenOrder[],
  identifier: string | number | `0x${string}`,
): FrontendOpenOrder | undefined {
  const parsed = typeof identifier === 'string' ? parseOrderIdentifier(identifier) : identifier
  return orders.find((order) =>
    typeof parsed === 'string' ? order.cloid?.toLowerCase() === parsed.toLowerCase() : order.oid === parsed,
  )
}

export function findPerpPosition(
  coin: string,
  state: Pick<ClearinghouseState, 'assetPositions'>,
): AssetPosition | undefined {
  const normalizedCoin = coin.toUpperCase()
  return state.assetPositions.find((assetPosition) => assetPosition.position.coin === normalizedCoin)
}
