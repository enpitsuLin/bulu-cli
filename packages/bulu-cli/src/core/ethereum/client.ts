import { createPublicClient, createWalletClient, http, type Chain } from 'viem'
import { mainnet, sepolia } from 'viem/chains'
import { useConfig } from '#/core/config'
import { toBuluAccount, type ToBuluAccountOptions } from './account'

const CAIP_TO_VIEM_CHAIN: Record<string, Chain> = {
  'eip155:1': mainnet,
  'eip155:11155111': sepolia,
}

export function resolveEthereumChain(caip2Id: string): Chain {
  const chain = CAIP_TO_VIEM_CHAIN[caip2Id]
  if (!chain) {
    throw new Error(`Unsupported Ethereum chain "${caip2Id}"`)
  }
  return chain
}

export function createBuluWalletClient(opts: ToBuluAccountOptions) {
  const config = useConfig()
  const caip2 = opts.chainId ?? 'eip155:1'
  const rpc = config.get(`chains.${caip2}.rpc` as any) as string | undefined
  const chain = resolveEthereumChain(caip2)
  const account = toBuluAccount(opts)

  return createWalletClient({
    account,
    chain,
    transport: http(rpc),
  })
}

export function createEthereumPublicClient(caip2Id: string = 'eip155:1') {
  const config = useConfig()
  const rpc = config.get(`chains.${caip2Id}.rpc` as any) as string | undefined
  const chain = resolveEthereumChain(caip2Id)
  return createPublicClient({ chain, transport: http(rpc) })
}
