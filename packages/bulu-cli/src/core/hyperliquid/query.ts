import type { Output } from '../output'
import { loadDataOrExit } from '../../utils/cli'

export interface ListCommandConfig<TItem, TRow extends Record<string, unknown>> {
  out: Output
  fetchItems: () => Promise<TItem[]>
  filter?: (item: TItem) => boolean
  limit?: number
  toRow: (item: TItem) => TRow
}

export async function fetchListItems<TItem, TRow extends Record<string, unknown>>(
  config: ListCommandConfig<TItem, TRow>,
): Promise<TRow[]> {
  const { out, fetchItems, filter, limit, toRow } = config

  const items = await loadDataOrExit(out, fetchItems(), 'Failed to fetch data')
  const filtered = filter ? items.filter(filter) : items
  const limited = limit !== undefined ? filtered.slice(0, limit) : filtered
  return limited.map(toRow)
}
