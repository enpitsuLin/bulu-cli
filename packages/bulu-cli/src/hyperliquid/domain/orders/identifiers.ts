export function parseOrderIdentifier(value: string): number | `0x${string}` {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('Order id is required')
  }
  if (/^0x[0-9a-fA-F]{32}$/.test(trimmed)) {
    return trimmed.toLowerCase() as `0x${string}`
  }
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`Invalid order id: ${value}`)
  }

  const parsed = Number(trimmed)
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Order id exceeds JavaScript safe integer range: ${value}`)
  }
  return parsed
}

export function isCloid(value: number | string): value is `0x${string}` {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{32}$/.test(value)
}
