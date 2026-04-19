import type { ArgsDef } from 'citty'
import { getVaultPath } from '../../core/config'
import { createOutput } from '../../core/output'
import { resolveTCXPassphrase } from '../../core/tcx'
import { requireChainAccount, resolveWallet } from '../../core/wallet'
import { signAndSubmitL1Action } from '../../protocols/hyperliquid'
import type { DefaultExchangeResponse, ExchangeAction } from '../../protocols/hyperliquid'

export interface MarketCommandArgs {
  wallet?: string
  testnet?: boolean
  json?: boolean
  format?: string
}

export interface MarketUserContext {
  walletName: string
  user: string
}

export const marketBaseArgs = {
  testnet: {
    type: 'boolean',
    description: 'Use Hyperliquid testnet',
    default: false,
  },
  wallet: {
    type: 'string',
    description: 'Wallet name or id (defaults to active wallet)',
  },
} satisfies ArgsDef

export function resolveMarketUserContext(
  args: Pick<MarketCommandArgs, 'wallet'>,
  out: ReturnType<typeof createOutput>,
): MarketUserContext {
  const { walletName, wallet } = resolveWallet(args.wallet, out)
  const ethAccount = requireChainAccount(wallet, 'eip155:1', out)
  return {
    walletName,
    user: ethAccount.address.toLowerCase(),
  }
}

export async function submitExchangeAction<TResponse = DefaultExchangeResponse>(args: {
  action: ExchangeAction
  walletName: string
  testnet?: boolean
}): Promise<TResponse> {
  const credential = await resolveTCXPassphrase()
  return signAndSubmitL1Action<TResponse>({
    action: args.action,
    nonce: Date.now(),
    walletName: args.walletName,
    vaultPath: getVaultPath(),
    credential,
    isTestnet: args.testnet,
  })
}
