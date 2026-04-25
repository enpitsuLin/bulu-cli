import { getWallet, signMessage, signTransaction, signTypedData } from '@bulu-cli/tcx-core'
import { hexToBigInt, serializeTransaction } from 'viem'
import { toAccount } from 'viem/accounts'
import type { LocalAccount } from 'viem/accounts'

export interface ToBuluAccountOptions {
  walletName: string
  credential: string
  vaultPath: string
  chainId?: string
}

export function toBuluAccount(opts: ToBuluAccountOptions): LocalAccount {
  const caip2 = opts.chainId ?? 'eip155:1'
  const wallet = getWallet(opts.walletName, opts.vaultPath)
  const account = wallet.accounts.find((a) => a.chainId.startsWith('eip155:'))

  if (!account) {
    throw new Error(`Wallet "${opts.walletName}" does not have an Ethereum account`)
  }

  const address = account.address as `0x${string}`

  return toAccount({
    address,
    async signMessage({ message }) {
      const messageStr =
        typeof message === 'string' ? message : typeof message.raw === 'string' ? message.raw : undefined

      if (messageStr === undefined) {
        // TODO: tcx-core does not yet support raw byte array / hash signing (NAPI only accepts String, and the Rust layer only performs EIP-191 personal-sign).
        // Support for Uint8Array message.raw will be added once tcx-core exposes a raw sign NAPI binding.
        throw new Error('Raw byte array messages are not supported by tcx-core; pass a string or hex string instead')
      }

      const result = signMessage(opts.walletName, caip2, messageStr, opts.credential, opts.vaultPath)
      return result.signature as `0x${string}`
    },
    async signTransaction(transaction, options) {
      const serializer = options?.serializer ?? serializeTransaction
      const serialized = await serializer(transaction)
      const result = signTransaction(opts.walletName, caip2, serialized, opts.credential, opts.vaultPath)
      const sig = result.signature as `0x${string}`
      const normalized = sig.slice(2)
      const r = `0x${normalized.slice(0, 64)}` as `0x${string}`
      const s = `0x${normalized.slice(64, 128)}` as `0x${string}`
      const v = hexToBigInt(`0x${normalized.slice(128, 130)}`)
      return serializer(transaction, { r, s, v })
    },
    async signTypedData(typedData) {
      const result = signTypedData(opts.walletName, caip2, JSON.stringify(typedData), opts.credential, opts.vaultPath)
      return result.signature as `0x${string}`
    },
  })
}
