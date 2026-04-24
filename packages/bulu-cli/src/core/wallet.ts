import { getWallet } from '@bulu-cli/tcx-core'

export function resolveWalletAddress(walletName: string, vaultPath: string): string {
  const wallet = getWallet(walletName, vaultPath)
  const account = wallet.accounts.find((item) => item.chainId.startsWith('eip155:'))

  if (!account) {
    throw new Error(`Wallet "${walletName}" does not have an Ethereum account`)
  }

  return account.address.toLowerCase()
}
