import { createPublicClient, createWalletClient, defineChain, http, type Chain } from 'viem'
import { mainnet, sepolia } from 'viem/chains'
import { useConfig, type BuluConfigChain } from '#/core/config'
import { toBuluAccount, type ToBuluAccountOptions } from './account'

const DEFAULT_CHAINS: Record<string, Chain> = {
  'eip155:1': mainnet,
  'eip155:11155111': sepolia,
}

function resolveBuiltinChain(caip2Id: string): Chain {
  const chain = DEFAULT_CHAINS[caip2Id]
  if (!chain) {
    throw new TypeError(`Unsupported Ethereum chain "${caip2Id}"`)
  }
  return chain
}

function resolveConfigChain(configChains: Record<string, BuluConfigChain>, caip2: string): Chain {
  const configChain = configChains[caip2]
  if (!configChain) {
    throw new TypeError(`Notfound chain config for "${caip2}"`)
  }
  if (!configChain.nativeCurrency || !configChain.rpc) {
    throw new TypeError(`Illgeal chain config for "${caip2}"`)
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

export function createBuluWalletClient(opts: ToBuluAccountOptions) {
  const config = useConfig()
  const caip2 = opts.chainId ?? 'eip155:1'
  const configChains = config.get(`chains`) ?? {}
  const chain = resolveBuiltinChain(caip2) ?? resolveConfigChain(configChains, caip2)
  const account = toBuluAccount(opts)

  return createWalletClient({
    account,
    chain,
    transport: http(),
  })
}

export function createEthereumPublicClient(caip2Id: string = 'eip155:1') {
  const config = useConfig()
  const rpc = config.get(`chains.${caip2Id}.rpc` as any) as string | undefined
  const chain = resolveBuiltinChain(caip2Id)
  return createPublicClient({ chain, transport: http(rpc) })
}
