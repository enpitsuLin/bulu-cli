import type { SpotMeta } from '../../protocols/hyperliquid'
import { partitionEntriesBySpot } from '../../protocols/hyperliquid'
import { loadDataOrExit } from '../../utils/cli'
import type { Output } from '../../core/output'

export interface PartitionedFetchConfig<T extends { coin: string }> {
  /** Fetch the raw items from the API */
  fetchItems: () => Promise<T[]>
  /** Which side to return */
  mode: 'spot' | 'perp'
  /** Spot metadata for partitioning (Set<string> or SpotMeta) */
  spotMeta: SpotMeta | Set<string>
}

/**
 * Fetch items and partition into spot / perp, returning the requested side.
 */
export async function fetchPartitioned<T extends { coin: string }>(config: PartitionedFetchConfig<T>): Promise<T[]> {
  const items = await config.fetchItems()
  const { spot, perps } = partitionEntriesBySpot(items, config.spotMeta)
  return config.mode === 'spot' ? spot : perps
}

export interface ListCommandConfig<TItem, TRow extends Record<string, unknown>> {
  out: Output
  fetchItems: () => Promise<TItem[]>
  filter?: (item: TItem) => boolean
  limit?: number
  toRow: (item: TItem) => TRow
}

/**
 * Fetch items, apply optional filter and limit, then map to rows.
 * Returns the rows so callers control output.
 */
export async function fetchListItems<TItem, TRow extends Record<string, unknown>>(
  config: ListCommandConfig<TItem, TRow>,
): Promise<TRow[]> {
  const { out, fetchItems, filter, limit, toRow } = config

  const items = await loadDataOrExit(out, fetchItems(), 'Failed to fetch data')
  const filtered = filter ? items.filter(filter) : items
  const limited = limit !== undefined ? filtered.slice(0, limit) : filtered
  return limited.map(toRow)
}
