import { describe, expect, test } from 'vitest'
import priceCommand from '../src/commands/market/price'
import longCommand from '../src/commands/market/perps/long'
import ordersCommand from '../src/commands/market/spot/orders'

describe('command smoke imports', () => {
  test('price command loads', () => {
    expect(priceCommand.meta.name).toBe('price')
  })

  test('perp long command loads', () => {
    expect(longCommand.meta.name).toBe('long')
  })

  test('spot orders command loads', () => {
    expect(ordersCommand.meta.name).toBe('orders')
  })
})
