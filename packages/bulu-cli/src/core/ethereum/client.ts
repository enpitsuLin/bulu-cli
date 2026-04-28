import { createPublicClient, createWalletClient, defineChain, http, type Chain } from 'viem'
import { mainnet, sepolia } from 'viem/chains'
import { useConfig, type BuluConfigChain } from '#/core/config'
import { toBuluAccount, type ToBuluAccountOptions } from './account'

const DEFAULT_CHAINS: Record<string, Chain> = {
  'eip155:1': mainnet,
  'eip155:11155111': sepolia,
}

function resolveConfigChain(configChains: Record<string, BuluConfigChain>, caip2: string): Chain {
  const configChain = configChains[caip2]
  if (!configChain) {
    throw new TypeError(`Chain config not found for "${caip2}"`)
  }
  if (!configChain.nativeCurrency || !configChain.rpc) {
    throw new TypeError(`Illegal chain config for "${caip2}"`)
  }
  const id = Number(caip2.split(':')[1]!)
  return defineChain({
    id,
    name: configChain.name ?? `Chain ${id}`,
    nativeCurrency: configChain.nativeCurrency,
    rpcUrls: {
      default: {
        http: [configChain.rpc],
      },
    },
  })
}

function resolveChain(caip2: string): Chain {
  if (DEFAULT_CHAINS[caip2]) {
    return DEFAULT_CHAINS[caip2]
  }
  const config = useConfig()
  const configChains = config.get('chains') ?? {}
  return resolveConfigChain(configChains, caip2)
}

export function createBuluWalletClient(opts: ToBuluAccountOptions) {
  const caip2 = opts.chainId ?? 'eip155:1'
  const chain = resolveChain(caip2)
  const account = toBuluAccount(opts)

  return createWalletClient({
    account,
    chain,
    transport: http(),
  })
}

export function createEthereumPublicClient(caip2Id: string = 'eip155:1') {
  const config = useConfig()
  const rpc = config.get(`chains.${caip2Id}.rpc`) as string | undefined
  const chain = resolveChain(caip2Id)
  return createPublicClient({ chain, transport: http(rpc) })
}
