import type { OutputOptions } from '../../../../core/output'
import type { DataView, HyperliquidView, TableView } from '../../../shared/view'
import type { PriceSummary } from '../use-cases/get-price-summary'

function createCsvView(summary: PriceSummary): DataView {
  const lines = ['pair,price,mark,oracle,period,change,high,low,volume']

  for (const row of summary.periods) {
    lines.push(
      `${summary.pair},${summary.price},${summary.mark},${summary.oracle},${row.period},${row.change},${row.high},${row.low},${row.volume}`,
    )
  }

  return {
    kind: 'data',
    data: lines.join('\n'),
  }
}

export function presentPriceSummary(summary: PriceSummary, output: OutputOptions): HyperliquidView {
  if (output.json || output.format === 'json') {
    return {
      kind: 'data',
      data: summary,
    }
  }

  if (output.format === 'csv') {
    return createCsvView(summary)
  }

  return {
    kind: 'table',
    rows: summary.periods,
    table: {
      columns: ['period', 'change', 'high', 'low', 'volume'],
      title: `${summary.pair} on Hyperliquid | Price: ${summary.price} | Mark: ${summary.mark} | Oracle: ${summary.oracle}`,
    },
  } satisfies TableView
}
