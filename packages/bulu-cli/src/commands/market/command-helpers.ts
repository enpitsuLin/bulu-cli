import type { Output } from '../../core/output'

export interface RenderResultOptions<T> {
  /** Output rows for table/csv modes */
  rows: T[]
  /** Key used in JSON empty array and for wallet-aware empty data */
  dataKey: string
  /** Message shown when rows are empty in non-JSON mode */
  emptyMessage: string
  /** Columns for table mode and CSV header generation */
  columns: string[]
  /** Table title (optional) */
  title?: string
  /** Full JSON payload (overrides default empty-array shape) */
  jsonData?: Record<string, unknown>
  /** Wallet name for empty JSON payload */
  walletName?: string
  /** User address for empty JSON payload */
  user?: string
}

export interface CommandArgs {
  json?: boolean
  format?: string
}

/**
 * Execute a synchronous function and exit on error.
 * Eliminates repetitive try/catch + process.exit(1) blocks.
 */
export function executeOrExit<T>(out: Output, fn: () => T, errorPrefix: string): T {
  try {
    return fn()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    out.warn(`${errorPrefix}: ${message}`)
    process.exit(1)
  }
}

/**
 * Await a promise and exit on rejection.
 * Eliminates repetitive try/catch around fetch calls.
 */
export async function loadDataOrExit<T>(out: Output, promise: Promise<T>, errorMessage: string): Promise<T> {
  try {
    return await promise
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    out.warn(`${errorMessage}: ${message}`)
    process.exit(1)
  }
}

/**
 * Render command result in JSON, CSV, or table format.
 * Handles empty results consistently across all commands.
 */
export function renderResult<T extends Record<string, unknown>>(
  out: Output,
  args: CommandArgs,
  options: RenderResultOptions<T>,
): void {
  const isJson = args.json || args.format === 'json'
  const isCsv = args.format === 'csv'
  const { rows, dataKey, emptyMessage, columns, title, jsonData, walletName, user } = options

  if (rows.length === 0) {
    if (isJson) {
      const payload =
        jsonData ?? (walletName !== undefined ? { wallet: walletName, user, [dataKey]: [] } : { [dataKey]: [] })
      out.data(payload)
    } else {
      out.success(emptyMessage)
    }
    return
  }

  if (isJson) {
    out.data(
      jsonData ?? (walletName !== undefined ? { wallet: walletName, user, [dataKey]: rows } : { [dataKey]: rows }),
    )
    return
  }

  if (isCsv) {
    out.data(columns.join(','))
    for (const row of rows) {
      out.data(columns.map((c) => String(row[c] ?? '')).join(','))
    }
    return
  }

  out.table(rows, { columns, title })
}

/**
 * Render a single-row result (used by leverage, margin, schedule-cancel, etc.).
 */
export function renderSingleResult<T extends Record<string, unknown>>(
  out: Output,
  args: CommandArgs,
  options: {
    row: T
    columns: string[]
    title?: string
    jsonData?: Record<string, unknown>
  },
): void {
  const isJson = args.json || args.format === 'json'
  const isCsv = args.format === 'csv'
  const { row, columns, title, jsonData } = options

  if (isJson) {
    out.data(jsonData ?? row)
    return
  }

  if (isCsv) {
    out.data(columns.join(','))
    out.data(columns.map((c) => String(row[c] ?? '')).join(','))
    return
  }

  out.table([row], { columns, title })
}
