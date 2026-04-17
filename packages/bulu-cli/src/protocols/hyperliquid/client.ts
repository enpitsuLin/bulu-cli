import { $fetch } from 'ofetch'
import { getHyperliquidBaseUrl } from '../../core/config'

const clientCache = new Map<string, ReturnType<typeof $fetch.create>>()

export function createHyperliquidClient(isTestnet?: boolean) {
  const baseURL = getHyperliquidBaseUrl(isTestnet)
  const cached = clientCache.get(baseURL)
  if (cached) {
    return cached
  }

  const client = $fetch.create({ baseURL })
  clientCache.set(baseURL, client)
  return client
}

async function postHyperliquid<TResponse>(
  path: '/info' | '/exchange',
  body: unknown,
  isTestnet?: boolean,
): Promise<TResponse> {
  return createHyperliquidClient(isTestnet)<TResponse>(path, {
    method: 'POST',
    body: body as Record<string, unknown>,
  })
}

export async function postHyperliquidInfo<TResponse>(body: unknown, isTestnet?: boolean): Promise<TResponse> {
  return postHyperliquid<TResponse>('/info', body, isTestnet)
}

export async function postHyperliquidExchange<TResponse>(body: unknown, isTestnet?: boolean): Promise<TResponse> {
  return postHyperliquid<TResponse>('/exchange', body, isTestnet)
}
