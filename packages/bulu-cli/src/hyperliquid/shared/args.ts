import type { ArgsDef } from 'citty'

export interface HyperliquidCommandArgs {
  wallet?: string
  testnet?: boolean
  json?: boolean
  format?: string
}

export const marketBaseArgs = {
  testnet: {
    type: 'boolean',
    description: 'Use Hyperliquid testnet',
    default: false,
  },
  wallet: {
    type: 'string',
    description: 'Wallet name or id (defaults to active wallet)',
  },
} satisfies ArgsDef

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
