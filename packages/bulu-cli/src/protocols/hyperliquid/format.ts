import type { OrderStatus } from './types'

export function stripTrailingZeros(value: string): string {
  if (!value.includes('.')) return value
  return value.replace(/\.?0+$/, '')
}

export function formatSize(value: string, decimals: number): string {
  if (!value.includes('.')) return value
  const [intPart, fracPart] = value.split('.')
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
