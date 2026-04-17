import type { OrderStatus } from './types'

export function stripTrailingZeros(value: string): string {
  if (!value.includes('.')) return value
  return value.replace(/\.?0+$/, '')
}

export function normalizeDecimalInput(
  value: string,
  label: string,
  options?: { absolute?: boolean; allowZero?: boolean },
): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error(`${label} is required`)
  }

  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid ${label}: ${value}`)
  }

  const numeric = Number(trimmed)
  if (!Number.isFinite(numeric)) {
    throw new Error(`Invalid ${label}: ${value}`)
  }

  if (!options?.allowZero && numeric === 0) {
    throw new Error(`${label} must be greater than zero`)
  }

  const normalized = options?.absolute && trimmed.startsWith('-') ? trimmed.slice(1) : trimmed
  return stripTrailingZeros(normalized)
}

export function formatSize(value: string, decimals: number): string {
  if (!value.includes('.')) return value
  const [intPart, fracPart] = value.split('.')
  if (decimals <= 0) {
    return stripTrailingZeros(intPart)
  }
  const trimmed = fracPart.slice(0, decimals)
  const combined = `${intPart}.${trimmed}`
  return stripTrailingZeros(combined)
}

export function formatOrderStatus(status: OrderStatus): string {
  if (typeof status === 'string') return status
  if ('resting' in status) return `resting (oid: ${status.resting.oid})`
  if ('filled' in status) return `filled (sz: ${status.filled.totalSz}, avgPx: ${status.filled.avgPx})`
  if ('error' in status) return `error: ${status.error}`
  return 'unknown'
}
