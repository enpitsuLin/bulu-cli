export interface FormatTimestampOptions {
  unit?: 'auto' | 'unix' | 'unixMs'
}

const UNIX_MS_THRESHOLD = 1_000_000_000_000

function formatDate(date: Date, fallback: number): string {
  return Number.isNaN(date.getTime()) ? String(fallback) : date.toISOString()
}

function resolveTimestampMs(value: number, unit: FormatTimestampOptions['unit'] = 'auto'): number {
  if (unit === 'unix') return value * 1000
  if (unit === 'unixMs') return value
  return Math.abs(value) >= UNIX_MS_THRESHOLD ? value : value * 1000
}

export function formatTimestamp(value: number, options?: FormatTimestampOptions): string {
  return formatDate(new Date(resolveTimestampMs(value, options?.unit)), value)
}

export function formatOptionalTimestamp(
  value?: number | null,
  options?: FormatTimestampOptions & { fallback?: string },
): string {
  return value == null ? (options?.fallback ?? 'Never') : formatTimestamp(value, options)
}
