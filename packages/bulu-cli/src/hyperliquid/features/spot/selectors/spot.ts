import { partitionEntriesBySpot } from '../../../domain/market/spot'
import { findOrderByIdentifier } from '../../../domain/orders/selectors'
import type { FrontendOpenOrder, SpotMeta } from '../../../domain/types'

export function partitionSpotEntries<T extends { coin: string }>(
  entries: T[],
  spotMeta: Pick<SpotMeta, 'universe'> | Set<string>,
): T[] {
  return partitionEntriesBySpot(entries, spotMeta).spot
}

export function selectSpotOrders(args: {
  orders: FrontendOpenOrder[]
  id?: string
  pairFilter?: string
  all: boolean
}): FrontendOpenOrder[] {
  const candidates = args.pairFilter ? args.orders.filter((order) => order.coin === args.pairFilter) : args.orders
  if (args.all) {
    return candidates
  }
  if (!args.id) {
    return []
  }
  const match = findOrderByIdentifier(candidates, args.id)
  return match ? [match] : []
}
