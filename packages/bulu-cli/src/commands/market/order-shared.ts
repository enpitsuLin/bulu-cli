import type { Output } from '../../core/output'
import type { ExchangeAction, OrderResponse } from '../../protocols/hyperliquid'
import { formatOrderStatus } from '../../protocols/hyperliquid'
import { submitExchangeAction } from './shared'
import type { CommandArgs } from '../../utils/output'

export interface OrderSubmissionContext {
  out: Output
  commandArgs: CommandArgs
  walletName: string
  user: string
  testnet?: boolean
}

export interface OrderRenderInput {
  detail: string
  titlePrefix: string
  jsonData: Record<string, unknown>
}

/**
 * Shared order submission and rendering logic.
 * Eliminates duplication between spot and perp order commands.
 */
export async function submitOrderAndRender(
  ctx: OrderSubmissionContext,
  action: ExchangeAction,
  render: OrderRenderInput,
): Promise<void> {
  const { out, commandArgs, walletName, testnet } = ctx

  const response = await submitExchangeAction<OrderResponse>({
    action,
    walletName,
    testnet,
  })

  const statuses = response.response.data.statuses.map((status, idx) => ({
    orderIndex: idx + 1,
    result: formatOrderStatus(status),
  }))

  const isJson = commandArgs.json || commandArgs.format === 'json'
  const isCsv = commandArgs.format === 'csv'

  if (isJson) {
    out.data({ ...render.jsonData, statuses })
    return
  }

  if (isCsv) {
    out.data('orderIndex,result')
    for (const row of statuses) {
      out.data(`${row.orderIndex},${row.result}`)
    }
    return
  }

  out.table(statuses, {
    columns: ['orderIndex', 'result'],
    title: `${render.titlePrefix} | ${walletName} | ${render.detail}`,
  })
}

/**
 * Build common order args on top of market query args.
 */
export function buildOrderPositionalArgs(
  base: Record<string, unknown>,
  config: {
    symbolName: string
    symbolDesc: string
    sizeDesc: string
    sizeRequired?: boolean
  },
): Record<string, unknown> {
  return {
    ...base,
    [config.symbolName]: {
      type: 'positional',
      description: config.symbolDesc,
      required: true,
    },
    size: {
      type: 'string',
      description: config.sizeDesc,
      required: config.sizeRequired ?? true,
    },
    price: {
      type: 'string',
      description: 'Limit price (omit for market order)',
    },
  }
}
