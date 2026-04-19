import { signTypedData } from '@bulu-cli/tcx-core'
import { postHyperliquidExchange } from './client'
import { buildHyperliquidTypedData, createL1ActionHash, splitSignature } from '../domain/crypto'
import type { ExchangeAction, ExchangeRequestBody, OrderResponse } from '../domain/types'

export async function signAndSubmitL1Action<TResponse = OrderResponse>(args: {
  action: ExchangeAction
  nonce: number
  walletName: string
  vaultPath: string
  credential: string
  isTestnet?: boolean
}): Promise<TResponse> {
  const { action, nonce, walletName, vaultPath, credential, isTestnet = false } = args

  const hash = createL1ActionHash({ action, nonce })
  const typedData = buildHyperliquidTypedData({ hash, isTestnet })
  const signed = signTypedData(walletName, 'eip155:1', JSON.stringify(typedData), credential, vaultPath)
  const signature = splitSignature(signed.signature as `0x${string}`)

  const body: ExchangeRequestBody = { action, nonce, signature }
  return postHyperliquidExchange<TResponse>(body, isTestnet)
}
