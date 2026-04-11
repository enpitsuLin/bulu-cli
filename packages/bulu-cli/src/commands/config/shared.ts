import { createOutput, resolveOutputOptions, type Output, type OutputOptions } from '../../core/output'

export interface ConfigJsonOutputArgs {
  json?: boolean
}

export interface ConfigListOutputArgs extends ConfigJsonOutputArgs {
  format?: string
}

export type ConfigRow = Record<string, string> & {
  Key: string
  Value: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function createConfigCommandOutput(args: ConfigJsonOutputArgs): Output {
  return createOutput(args.json ? { json: true, format: 'json' } : { json: false, format: 'table' })
}

export function resolveConfigListOutput(args: ConfigListOutputArgs): { output: Output; outputOpts: OutputOptions } {
  const outputOpts = resolveOutputOptions(args)
  return {
    output: createOutput(outputOpts),
    outputOpts,
  }
}

export function formatConfigValue(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  return JSON.stringify(value)
}

export function parseConfigValue(value: string): unknown {
  const trimmed = value.trim()

  if (trimmed === '') {
    return ''
  }

  if (trimmed === 'true') {
    return true
  }

  if (trimmed === 'false') {
    return false
  }

  if (trimmed === 'null') {
    return null
  }

  if (/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(trimmed)) {
    return Number(trimmed)
  }

  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    try {
      return JSON.parse(trimmed)
    } catch {
      return value
    }
  }

  return value
}

export function flattenConfigRows(config: Record<string, unknown>, prefix = ''): ConfigRow[] {
  const rows: ConfigRow[] = []

  for (const key of Object.keys(config).sort()) {
    const value = config[key]
    const nextKey = prefix ? `${prefix}.${key}` : key

    if (isRecord(value)) {
      rows.push(...flattenConfigRows(value, nextKey))
      continue
    }

    rows.push({
      Key: nextKey,
      Value: formatConfigValue(value),
    })
  }

  return rows
}
