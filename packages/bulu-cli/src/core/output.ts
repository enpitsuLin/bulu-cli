import { styleText } from 'node:util'
import { Table } from 'console-table-printer'

export interface OutputOptions {
  json: boolean
  format: 'table' | 'csv' | 'json'
}

export interface TableOptions {
  columns: string[]
  title?: string
}

export interface Output {
  data(obj: unknown): void
  table(rows: Record<string, unknown>[], opts: TableOptions): void
  success(msg: string): void
  warn(msg: string): void
}

function write(str: string) {
  process.stdout.write(`${str}\n`)
}

export function createOutput(opts: OutputOptions): Output {
  const isJson = opts.json || opts.format === 'json'

  return {
    data(obj: unknown) {
      if (isJson) {
        write(JSON.stringify(obj))
      } else {
        write(typeof obj === 'string' ? obj : JSON.stringify(obj))
      }
    },

    table(rows: Record<string, unknown>[], tableOpts: TableOptions) {
      if (isJson) {
        write(JSON.stringify(rows))
        return
      }
      if (opts.format === 'csv') {
        const { columns } = tableOpts
        write(columns.join(','))
        for (const row of rows) {
          write(columns.map((c) => String(row[c] ?? '')).join(','))
        }
        return
      }
      if (tableOpts.title) {
        write(styleText('bold', tableOpts.title))
      }
      const t = new Table({
        columns: tableOpts.columns.map((name) => ({ name, alignment: 'left' })),
      })
      for (const row of rows) {
        t.addRow(row)
      }
      write(t.render())
    },

    success(msg: string) {
      if (isJson) {
        write(JSON.stringify({ status: 'success', message: msg }))
      } else {
        write(styleText('green', `✓ ${msg}`))
      }
    },

    warn(msg: string) {
      if (isJson) {
        write(JSON.stringify({ status: 'warning', message: msg }))
      } else {
        write(styleText('yellow', `⚠ ${msg}`))
      }
    },
  }
}

export function resolveOutputOptions(args: { json?: boolean; format?: string }): OutputOptions {
  if (args.json) return { json: true, format: 'json' }
  const format = (args.format as OutputOptions['format']) || 'table'
  return { json: false, format }
}
