import { getWallet, type WalletAccount, type WalletInfo } from '@bulu-cli/tcx-core'
import { getActiveWallet, getVaultPath } from './config'
import type { Output } from './output'

export interface ResolvedWallet {
  walletName: string
  wallet: WalletInfo
}

export function resolveWallet(argsWallet: string | undefined, out: Output): ResolvedWallet {
  const walletName = argsWallet ? String(argsWallet) : getActiveWallet()
  if (!walletName) {
    out.warn('No wallet specified and no active wallet configured')
    process.exit(1)
  }

  let wallet: WalletInfo
  try {
    wallet = getWallet(walletName, getVaultPath())
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    out.warn(`Failed to load wallet: ${message}`)
    process.exit(1)
  }

  return { walletName, wallet }
}

export function requireChainAccount(wallet: WalletInfo, chainId: string, out: Output): WalletAccount {
  const account = wallet.accounts.find((a) => a.chainId === chainId)
  if (!account) {
    out.warn(`Wallet has no account for chain ${chainId}`)
    process.exit(1)
  }
  return account
}
