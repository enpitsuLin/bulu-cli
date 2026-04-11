import type { WalletInfo } from '@bulu-cli/tcx-core'
import { createOutput } from '../../core/output'

export interface WalletJsonOutputArgs {
  json?: boolean
}

export interface WalletDetailRenderOptions {
  includeAccountKeys?: boolean
  includeCurve?: boolean
}

type WalletInfoWithoutAccountKeys = Omit<WalletInfo, 'accounts'> & {
  accounts: Array<Omit<WalletInfo['accounts'][number], 'publicKey' | 'extPubKey'>>
}

type WalletInfoWithoutCurve = Omit<WalletInfo, 'meta' | 'keystore'> & {
  meta: Omit<WalletInfo['meta'], 'curve'>
  keystore: Omit<WalletInfo['keystore'], 'curve'>
}

type WalletInfoForDisplay = Omit<WalletInfo, 'accounts' | 'meta'> & {
  meta: Omit<WalletInfo['meta'], 'curve'>
  keystore: Omit<WalletInfo['keystore'], 'curve'>
  accounts: Array<Omit<WalletInfo['accounts'][number], 'publicKey' | 'extPubKey'>>
}

type WalletDetailOutput = WalletInfo | WalletInfoWithoutAccountKeys | WalletInfoWithoutCurve | WalletInfoForDisplay

function createWalletOutput(args: WalletJsonOutputArgs) {
  return createOutput(args.json ? { json: true, format: 'json' } : { json: false, format: 'table' })
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000)
  if (Number.isNaN(date.getTime())) {
    return String(timestamp)
  }

  return date.toISOString()
}

function stripAccountKeys(wallet: WalletInfo): WalletInfoWithoutAccountKeys {
  return {
    ...wallet,
    accounts: wallet.accounts.map((accountInfo) => {
      const { publicKey, extPubKey, ...account } = accountInfo
      void publicKey
      void extPubKey
      return account
    }),
  }
}

function stripCurve(wallet: WalletInfo): WalletInfoWithoutCurve {
  const { curve: metaCurve, ...meta } = wallet.meta
  const { curve: keystoreCurve, ...keystore } = wallet.keystore
  void metaCurve
  void keystoreCurve

  return {
    ...wallet,
    meta,
    keystore,
  }
}

export function renderWalletDetail(
  wallet: WalletInfo,
  args: WalletJsonOutputArgs,
  options: WalletDetailRenderOptions = {},
): void {
  const output = createWalletOutput(args)
  const includeAccountKeys = options.includeAccountKeys ?? true
  const includeCurve = options.includeCurve ?? true

  let detailWallet: WalletDetailOutput = wallet
  if (!includeAccountKeys) {
    detailWallet = stripAccountKeys(detailWallet as WalletInfo)
  }
  if (!includeCurve) {
    detailWallet = stripCurve(detailWallet as WalletInfo)
  }

  if (args.json) {
    output.data(detailWallet)
    return
  }

  const walletColumns = includeCurve
    ? ['Name', 'ID', 'Network', 'Source', 'Derivable', 'Version', 'Curve', 'Timestamp', 'Accounts']
    : ['Name', 'ID', 'Network', 'Source', 'Derivable', 'Version', 'Timestamp', 'Accounts']

  output.table(
    [
      {
        Name: wallet.meta.name,
        ID: wallet.meta.id,
        Network: wallet.meta.network,
        Source: wallet.meta.source,
        Derivable: wallet.meta.derivable ? 'Yes' : 'No',
        Version: wallet.meta.version,
        ...(includeCurve ? { Curve: wallet.meta.curve ?? '' } : {}),
        Timestamp: formatTimestamp(wallet.meta.timestamp),
        Accounts: wallet.accounts.length,
      },
    ],
    {
      columns: walletColumns,
      title: 'Wallet',
    },
  )

  if (wallet.accounts.length === 0) {
    output.warn('No accounts found for wallet')
    return
  }

  const accountColumns = includeAccountKeys
    ? ['Chain ID', 'Address', 'Public Key', 'Derivation Path', 'Ext Pub Key']
    : ['Chain ID', 'Address', 'Derivation Path']

  output.table(
    wallet.accounts.map((account) => ({
      'Chain ID': account.chainId,
      Address: account.address,
      ...(includeAccountKeys ? { 'Public Key': account.publicKey } : {}),
      'Derivation Path': account.derivationPath ?? '',
      ...(includeAccountKeys ? { 'Ext Pub Key': account.extPubKey ?? '' } : {}),
    })),
    {
      columns: accountColumns,
      title: `Accounts (${wallet.accounts.length})`,
    },
  )
}

export function createWalletCommandOutput(args: WalletJsonOutputArgs) {
  return createWalletOutput(args)
}
