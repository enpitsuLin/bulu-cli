import type { WalletInfo } from '@bulu-cli/tcx-core'
import { getWallet } from '@bulu-cli/tcx-core'
import { join } from 'node:path'

const WALLETS_DIR = 'wallets'

export interface StoredWallet {
  wallet: WalletInfo
  path: string
  data: WalletInfo
}

function getWalletsDir(vaultPath: string): string {
  return join(vaultPath, WALLETS_DIR)
}

function getWalletPath(vaultPath: string, walletId: string): string {
  return join(getWalletsDir(vaultPath), `${walletId}.json`)
}

export function getStoredWalletPath(vaultPath: string, walletId: string): string {
  return getWalletPath(vaultPath, walletId)
}

export function resolveStoredWallet(identifier: string, vaultPath: string): StoredWallet {
  const wallet = getWallet(identifier, vaultPath)
  const path = getWalletPath(vaultPath, wallet.meta.id)

  return {
    wallet,
    path,
    data: wallet,
  }
}
