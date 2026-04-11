import type { WalletInfo } from '@bulu-cli/tcx-core'
import { listWallet } from '@bulu-cli/tcx-core'
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const WALLETS_DIR = 'wallets'
const WALLET_DIR_MODE = 0o700
const WALLET_FILE_MODE = 0o600

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

function ensureWalletsDir(vaultPath: string): string {
  const walletsDir = getWalletsDir(vaultPath)
  if (!existsSync(walletsDir)) {
    mkdirSync(walletsDir, { recursive: true, mode: WALLET_DIR_MODE })
  }

  try {
    chmodSync(walletsDir, WALLET_DIR_MODE)
  } catch {
    // Best-effort permission tightening on platforms/filesystems that support it.
  }

  return walletsDir
}

function readStoredWalletFile(path: string): WalletInfo {
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as WalletInfo
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to read wallet file at ${path}: ${message}`)
  }
}

function toStoredWallet(wallet: WalletInfo, vaultPath: string): StoredWallet {
  const path = getWalletPath(vaultPath, wallet.meta.id)
  return {
    wallet,
    path,
    data: readStoredWalletFile(path),
  }
}

function formatWalletCandidates(wallets: WalletInfo[]): string {
  return wallets.map((wallet) => `${wallet.meta.name} (${wallet.meta.id})`).join(', ')
}

export function resolveStoredWallet(identifier: string, vaultPath: string): StoredWallet {
  const normalizedIdentifier = identifier.trim()
  if (!normalizedIdentifier) {
    throw new Error('Wallet identifier is required')
  }

  const wallets = listWallet(vaultPath)
  if (wallets.length === 0) {
    throw new Error(`No wallets found in vault: ${vaultPath}`)
  }

  const exactIdMatch = wallets.find((wallet) => wallet.meta.id === normalizedIdentifier)
  if (exactIdMatch) {
    return toStoredWallet(exactIdMatch, vaultPath)
  }

  const exactNameMatches = wallets.filter((wallet) => wallet.meta.name === normalizedIdentifier)
  if (exactNameMatches.length === 1) {
    return toStoredWallet(exactNameMatches[0], vaultPath)
  }
  if (exactNameMatches.length > 1) {
    throw new Error(
      `Multiple wallets share the name "${normalizedIdentifier}". Use a wallet id instead: ${formatWalletCandidates(exactNameMatches)}`,
    )
  }

  const idPrefixMatches = wallets.filter((wallet) => wallet.meta.id.startsWith(normalizedIdentifier))
  if (idPrefixMatches.length === 1) {
    return toStoredWallet(idPrefixMatches[0], vaultPath)
  }
  if (idPrefixMatches.length > 1) {
    throw new Error(
      `Wallet id prefix "${normalizedIdentifier}" is ambiguous. Matches: ${formatWalletCandidates(idPrefixMatches)}`,
    )
  }

  throw new Error(`Wallet "${normalizedIdentifier}" not found`)
}

export function persistWallet(wallet: WalletInfo, vaultPath: string): string {
  ensureWalletsDir(vaultPath)

  const path = getWalletPath(vaultPath, wallet.meta.id)
  writeFileSync(path, JSON.stringify(wallet, null, 2), { mode: WALLET_FILE_MODE })

  try {
    chmodSync(path, WALLET_FILE_MODE)
  } catch {
    // Best-effort permission tightening on platforms/filesystems that support it.
  }

  return path
}

export function removeStoredWallet(path: string): void {
  rmSync(path)
}

export function renameWallet(wallet: WalletInfo, name: string): WalletInfo {
  const normalizedName = name.trim()
  if (!normalizedName) {
    throw new Error('Wallet name is required')
  }

  return {
    ...wallet,
    meta: {
      ...wallet.meta,
      name: normalizedName,
    },
    keystore: {
      ...wallet.keystore,
      imTokenMeta: {
        ...wallet.keystore.imTokenMeta,
        name: normalizedName,
      },
    },
  }
}
