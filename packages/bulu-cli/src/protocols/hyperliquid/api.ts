import { $fetch } from 'ofetch'
import { getHyperliquidBaseUrl } from '../../core/config'

export function createHyperliquidClient(isTestnet?: boolean) {
  return $fetch.create({ baseURL: getHyperliquidBaseUrl(isTestnet) })
}
