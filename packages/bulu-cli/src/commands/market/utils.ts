import { parseOrderIdentifier } from '../../protocols/hyperliquid'
import type { FrontendOpenOrder } from '../../protocols/hyperliquid'

export function parseTimeArg(value: string, label: string): number {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error(`${label} is required`)
  }

  if (/^\d+$/.test(trimmed)) {
    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed)) {
      throw new Error(`Invalid ${label}: ${value}`)
    }
    return trimmed.length >= 13 ? parsed : parsed * 1000
  }

  const parsed = Date.parse(trimmed)
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid ${label}: ${value}`)
  }
  return parsed
}

export function parseLimitArg(value: string | undefined, defaultValue = 50): number {
  const limit = value ? Number(value) : defaultValue
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new Error(`Invalid limit: ${value}`)
  }
  return limit
}

export function findOrderByIdentifier(
  orders: FrontendOpenOrder[],
  identifier: string | number | `0x${string}`,
): FrontendOpenOrder | undefined {
  const parsed = typeof identifier === 'string' ? parseOrderIdentifier(identifier) : identifier
  return orders.find((order) =>
    typeof parsed === 'string' ? order.cloid?.toLowerCase() === parsed.toLowerCase() : order.oid === parsed,
  )
}
