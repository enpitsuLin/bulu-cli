import type { Output } from '#/core/output'
import type { HyperliquidOrderWire, HyperliquidPlaceOrderStatus } from '#/protocol/hyperliquid'

export type HyperliquidTif = HyperliquidOrderWire['t']['limit']['tif']

export function resolveCommandWallet(walletArg: string | undefined, defaultWallet: string | undefined): string {
  const walletName = walletArg || defaultWallet
  if (!walletName) {
    throw new Error('Wallet is required; pass --wallet or set config.default.wallet')
  }

  return walletName
}

export function normalizeOrderSide(side: string, options?: { allowPositionAliases?: boolean }): boolean {
  const normalized = side.trim().toLowerCase()
  if (normalized === 'buy' || normalized === 'bid' || normalized === 'b') {
    return true
  }
  if (normalized === 'sell' || normalized === 'ask' || normalized === 'a') {
    return false
  }
  if (options?.allowPositionAliases) {
    if (normalized === 'long') {
      return true
    }
    if (normalized === 'short') {
      return false
    }
  }

  throw new Error(`Unsupported side "${side}", expected buy or sell`)
}

export function normalizeTif(tif: string): HyperliquidTif {
  const normalized = tif.trim().toLowerCase()
  if (normalized === 'alo') {
    return 'Alo'
  }
  if (normalized === 'ioc') {
    return 'Ioc'
  }
  if (normalized === 'gtc') {
    return 'Gtc'
  }

  throw new Error(`Unsupported tif "${tif}", expected gtc, ioc, or alo`)
}

export function assertCloid(value: string): void {
  if (!/^0x[0-9a-f]{32}$/i.test(value)) {
    throw new Error('cloid must be 16 bytes in hex, e.g. 0x1234...abcd')
  }
}

export function parseOid(value: string): number {
  const oid = Number(value)
  if (!Number.isSafeInteger(oid) || oid < 0) {
    throw new Error(`Invalid order id "${value}"`)
  }

  return oid
}

export function parseOrderIdentifier(value: string): number | string {
  if (/^0x[0-9a-f]{32}$/i.test(value)) {
    return value
  }

  if (value.startsWith('0x') || value.startsWith('0X')) {
    throw new Error(`Invalid cloid "${value}", expected 16 bytes in hex, e.g. 0x1234...abcd`)
  }

  return parseOid(value)
}

export function createHyperliquidOrderWire(input: {
  asset: number
  isBuy: boolean
  price: string
  size: string
  reduceOnly: boolean
  tif: HyperliquidTif
  cloid?: string
}): HyperliquidOrderWire {
  const order: HyperliquidOrderWire = {
    a: input.asset,
    b: input.isBuy,
    p: input.price,
    s: input.size,
    r: input.reduceOnly,
    t: {
      limit: {
        tif: input.tif,
      },
    },
  }

  if (input.cloid) {
    order.c = input.cloid
  }

  return order
}

export function writePlaceOrderStatuses(output: Output, statuses: HyperliquidPlaceOrderStatus[]): void {
  for (const status of statuses) {
    if ('error' in status) {
      output.warn(`Order rejected: ${status.error}`)
    } else if ('filled' in status) {
      output.success(`Filled ${status.filled.totalSz} @ ${status.filled.avgPx} (oid=${status.filled.oid})`)
    } else if ('resting' in status) {
      output.success(`Order resting (oid=${status.resting.oid})`)
    }
  }
}
