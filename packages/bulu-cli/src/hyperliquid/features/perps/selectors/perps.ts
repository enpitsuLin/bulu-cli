import { partitionEntriesBySpot } from '../../../domain/market/spot'
import { findOrderByIdentifier } from '../../../domain/orders/selectors'
import type { FrontendOpenOrder, SpotMeta } from '../../../domain/types'

export function partitionPerpEntries<T extends { coin: string }>(
  entries: T[],
  spotMeta: Pick<SpotMeta, 'universe'> | Set<string>,
): T[] {
  return partitionEntriesBySpot(entries, spotMeta).perps
}

export function splitPerpAndSpotOrders(
  orders: FrontendOpenOrder[],
  spotMeta: Pick<SpotMeta, 'universe'> | Set<string>,
): { perps: FrontendOpenOrder[]; spot: FrontendOpenOrder[] } {
  return partitionEntriesBySpot(orders, spotMeta)
}

export function selectPerpOrders(args: {
  orders: FrontendOpenOrder[]
  spotOrders: FrontendOpenOrder[]
  id?: string
  coinFilter?: string
  all: boolean
}): { selected: FrontendOpenOrder[]; spotMatch?: FrontendOpenOrder } {
  const candidates = args.coinFilter ? args.orders.filter((order) => order.coin === args.coinFilter) : args.orders
  const selected = args.all
    ? candidates
    : (() => {
        if (!args.id) return []
        const match = findOrderByIdentifier(candidates, args.id)
        return match ? [match] : []
      })()

  return {
    selected,
    spotMatch: args.id && !args.all ? findOrderByIdentifier(args.spotOrders, args.id) : undefined,
  }
}

export function isMarketTrigger(order: FrontendOpenOrder): boolean {
  return order.orderType.toLowerCase().includes('market')
}
