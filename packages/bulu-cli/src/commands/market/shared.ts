import { getVaultPath } from '../../core/config'
import { createOutput, resolveOutputOptions } from '../../core/output'
import { resolveTCXPassphrase } from '../../core/tcx'
import { requireChainAccount, resolveWallet } from '../../core/wallet'
import { withDefaultArgs } from '../../core/args-def'
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

export function resolveMarketQueryArgs(extraArgs: Record<string, unknown> = {}) {
  return withDefaultArgs({
    ...extraArgs,
    testnet: {
      type: 'boolean',
      description: 'Use Hyperliquid testnet',
      default: false,
    },
    wallet: {
      type: 'string',
      description: 'Wallet name or id (defaults to active wallet)',
    },
  })
}

export function resolveMarketOutput(args: Pick<MarketCommandArgs, 'json' | 'format'>) {
  return createOutput(resolveOutputOptions(args))
}

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

export function handleCommandError(out: ReturnType<typeof createOutput>, message: string): never {
  out.warn(message)
  process.exit(1)
}
