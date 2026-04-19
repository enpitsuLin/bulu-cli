import { getWallet, type WalletAccount, type WalletInfo } from '@bulu-cli/tcx-core'
import { getActiveWallet, getVaultPath } from '#/core/config'
import type { Output } from '#/core/output'
import { resolveTCXPassphrase } from '#/core/tcx'
import type { DefaultExchangeResponse, ExchangeAction } from '../domain/types'
import { signAndSubmitL1Action } from '../gateway/exchange'
import { fail } from './errors'

export interface HyperliquidCommandContext {
  out: Output
  testnet: boolean
}

export interface HyperliquidWalletContext extends HyperliquidCommandContext {
  walletName: string
  user: string
}

function resolveWalletOrThrow(walletNameArg?: string): { walletName: string; wallet: WalletInfo } {
  const walletName = walletNameArg ? String(walletNameArg) : getActiveWallet()
  if (!walletName) {
    fail('No wallet specified and no active wallet configured')
  }

  try {
    return {
      walletName,
      wallet: getWallet(walletName, getVaultPath()),
    }
  } catch (error) {
    fail(`Failed to load wallet: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function requireChainAccountOrThrow(wallet: WalletInfo, chainId: string): WalletAccount {
  const account = wallet.accounts.find((candidate) => candidate.chainId === chainId)
  if (!account) {
    fail(`Wallet has no account for chain ${chainId}`)
  }

  return account
}

export function createHyperliquidCommandContext(args: { testnet?: boolean }, out: Output): HyperliquidCommandContext {
  return {
    out,
    testnet: args.testnet === true,
  }
}

export function requireHyperliquidWalletContext(
  args: { wallet?: string; testnet?: boolean },
  out: Output,
): HyperliquidWalletContext {
  const { walletName, wallet } = resolveWalletOrThrow(args.wallet)
  const ethAccount = requireChainAccountOrThrow(wallet, 'eip155:1')

  return {
    out,
    testnet: args.testnet === true,
    walletName,
    user: ethAccount.address.toLowerCase(),
  }
}

export async function submitExchangeAction<TResponse = DefaultExchangeResponse>(
  ctx: Pick<HyperliquidWalletContext, 'walletName' | 'testnet'>,
  action: ExchangeAction,
): Promise<TResponse> {
  const credential = await resolveTCXPassphrase()

  return signAndSubmitL1Action<TResponse>({
    action,
    nonce: Date.now(),
    walletName: ctx.walletName,
    vaultPath: getVaultPath(),
    credential,
    isTestnet: ctx.testnet,
  })
}
