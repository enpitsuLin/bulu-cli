import type { Output, TableOptions } from '../../core/output'

export interface TableView {
  kind: 'table'
  rows: Record<string, unknown>[]
  table: TableOptions
}

export interface DataView {
  kind: 'data'
  data: unknown
}

export type HyperliquidView = TableView | DataView

export function renderView(out: Output, view: HyperliquidView): void {
  if (view.kind === 'table') {
    out.table(view.rows, view.table)
    return
  }

  out.data(view.data)
}
