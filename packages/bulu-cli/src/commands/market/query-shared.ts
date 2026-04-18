import type { SpotMeta, FrontendOpenOrder } from '../../protocols/hyperliquid'
import { partitionEntriesBySpot } from '../../protocols/hyperliquid'
import { loadDataOrExit } from '../../utils/cli'
import type { Output } from '../../core/output'
import { findOrderByIdentifier } from './utils'

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

export interface ListCommandConfig<
  TItem,
  TRow extends Record<string, unknown>,
  TDisplayRow extends Record<string, unknown> = TRow,
> {
  out: Output
  args: { json?: boolean; format?: string; testnet?: boolean }
  walletName: string
  user: string
  /** Fetch and partition items */
  fetchItems: () => Promise<TItem[]>
  /** Optional filter applied after partitioning */
  filter?: (item: TItem) => boolean
  /** Optional slice limit */
  limit?: number
  /** Convert item to JSON/table row */
  toRow: (item: TItem) => TRow
  /** Convert item to display row (for table/csv); falls back to toRow */
  toDisplayRow?: (item: TItem) => TDisplayRow
  /** Output configuration */
  columns: string[]
  title: string
}

/**
 * End-to-end list command runner: fetch, filter, format, render.
 * Used by orders, fills, and history commands.
 */
export async function runListCommand<
  TItem,
  TRow extends Record<string, unknown>,
  TDisplayRow extends Record<string, unknown> = TRow,
>(config: ListCommandConfig<TItem, TRow, TDisplayRow>): Promise<void> {
  const { out, args, fetchItems, filter, limit, toRow, toDisplayRow, columns, title } = config

  const items = await loadDataOrExit(out, fetchItems(), 'Failed to fetch data')
  const filtered = filter ? items.filter(filter) : items
  const limited = limit !== undefined ? filtered.slice(0, limit) : filtered
  const rawRows = limited.map(toRow)
  const displayRows = toDisplayRow ? limited.map(toDisplayRow) : (rawRows as unknown as TDisplayRow[])

  const isJson = args.json || args.format === 'json'
  const rows = isJson
    ? (rawRows as unknown as Record<string, unknown>[])
    : (displayRows as unknown as Record<string, unknown>[])

  out.table(rows, { columns, title })
}

export interface CancelCommandConfig<TItem extends { coin: string; oid: number; cloid?: string | null }> {
  out: Output
  args: { testnet?: boolean; all?: boolean; id?: string }
  walletName: string
  user: string
  /** Fetch and partition candidates */
  fetchItems: () => Promise<TItem[]>
  /** Filter by pair/coin if provided */
  symbolFilter?: string
  /** Build the cancel action from selected items */
  buildCancelAction: (items: TItem[]) => { type: string; cancels: unknown[] }
  /** Format a selected item as a display row */
  toRow: (item: TItem) => Record<string, unknown>
  /** Output configuration */
  columns: string[]
  title: string
  /** Error message when no matching item found */
  notFoundMessage: string
  /** Optional: warn and exit if a spot order with the same id exists (perp mode) */
  spotFallbackCheck?: { items: TItem[]; message: string }
}

/**
 * End-to-end cancel command runner.
 */
export async function runCancelCommand<TItem extends { coin: string; oid: number; cloid?: string | null }>(
  config: CancelCommandConfig<TItem>,
): Promise<void> {
  const {
    out,
    args,
    walletName,
    fetchItems,
    symbolFilter,
    buildCancelAction,
    toRow,
    columns,
    title,
    notFoundMessage,
    spotFallbackCheck,
  } = config

  if (!args.all && !args.id) {
    out.warn('Provide an order id or use --all')
    process.exit(1)
  }

  const items = await loadDataOrExit(out, fetchItems(), 'Failed to fetch open orders')
  const candidates = symbolFilter ? items.filter((i) => i.coin === symbolFilter) : items

  const selected = args.all
    ? candidates
    : (() => {
        const match = findOrderByIdentifier(candidates as unknown as FrontendOpenOrder[], String(args.id))
        return match ? [match as unknown as TItem] : []
      })()

  if (selected.length === 0) {
    if (spotFallbackCheck && !args.all) {
      const spotMatch = findOrderByIdentifier(
        spotFallbackCheck.items as unknown as FrontendOpenOrder[],
        String(args.id),
      )
      if (spotMatch) {
        out.warn(spotFallbackCheck.message)
        process.exit(1)
      }
    }
    out.warn(notFoundMessage)
    process.exit(1)
  }

  const action = buildCancelAction(selected)

  const { submitExchangeAction } = require('./shared')
  await loadDataOrExit(
    out,
    submitExchangeAction({ action, walletName, testnet: args.testnet }),
    'Failed to cancel order',
  )

  const rows = selected.map(toRow)
  out.table(rows as Record<string, unknown>[], { columns, title })
}
