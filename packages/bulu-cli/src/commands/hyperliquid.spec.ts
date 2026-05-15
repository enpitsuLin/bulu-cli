import { describe, expect, it, vi } from 'vitest'
import {
  assertCloid,
  createHyperliquidOrderWire,
  normalizeOrderSide,
  normalizeTif,
  parseOid,
  parseOrderIdentifier,
  resolveCommandWallet,
  writePlaceOrderStatuses,
} from './hyperliquid'
import type { Output } from '#/core/output'

describe('Hyperliquid command helpers', () => {
  it('resolves wallet args before config defaults', () => {
    expect(resolveCommandWallet('alice', 'main')).toBe('alice')
    expect(resolveCommandWallet(undefined, 'main')).toBe('main')
    expect(() => resolveCommandWallet(undefined, undefined)).toThrow('Wallet is required')
  })

  it('normalizes sides and time-in-force values', () => {
    expect(normalizeOrderSide('buy')).toBe(true)
    expect(normalizeOrderSide('ask')).toBe(false)
    expect(normalizeOrderSide('long', { allowPositionAliases: true })).toBe(true)
    expect(() => normalizeOrderSide('long')).toThrow('Unsupported side')

    expect(normalizeTif('gtc')).toBe('Gtc')
    expect(normalizeTif('IOC')).toBe('Ioc')
    expect(() => normalizeTif('day')).toThrow('Unsupported tif')
  })

  it('validates order identifiers', () => {
    expect(parseOid('42')).toBe(42)
    expect(() => parseOid('1.2')).toThrow('Invalid order id')

    expect(parseOrderIdentifier('42')).toBe(42)
    expect(parseOrderIdentifier('0x1234567890abcdef1234567890abcdef')).toBe('0x1234567890abcdef1234567890abcdef')
    expect(() => parseOrderIdentifier('0x1234')).toThrow('Invalid cloid')
    expect(() => assertCloid('0x1234')).toThrow('cloid must be 16 bytes')
  })

  it('creates order wire payloads with optional cloids', () => {
    expect(
      createHyperliquidOrderWire({
        asset: 7,
        isBuy: true,
        price: '10.5',
        size: '2',
        reduceOnly: false,
        tif: 'Gtc',
        cloid: '0x1234567890abcdef1234567890abcdef',
      }),
    ).toEqual({
      a: 7,
      b: true,
      p: '10.5',
      s: '2',
      r: false,
      t: { limit: { tif: 'Gtc' } },
      c: '0x1234567890abcdef1234567890abcdef',
    })
  })

  it('writes place-order statuses consistently', () => {
    const output = {
      data: vi.fn(),
      table: vi.fn(),
      success: vi.fn(),
      warn: vi.fn(),
    } satisfies Output

    writePlaceOrderStatuses(output, [
      { error: 'bad price' },
      { filled: { totalSz: '1', avgPx: '2', oid: 3 } },
      { resting: { oid: 4 } },
    ])

    expect(output.warn).toHaveBeenCalledWith('Order rejected: bad price')
    expect(output.success).toHaveBeenCalledWith('Filled 1 @ 2 (oid=3)')
    expect(output.success).toHaveBeenCalledWith('Order resting (oid=4)')
  })
})
