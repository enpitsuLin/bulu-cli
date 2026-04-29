import { getWallet, signMessage, signRaw, signTransaction, signTypedData } from '@bulu-cli/tcx-core'
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
      if (typeof message === 'string') {
        const result = signMessage(opts.walletName, caip2, message, opts.credential, opts.vaultPath)
        return result.signature as `0x${string}`
      }
      if (message.raw instanceof Uint8Array) {
        const result = signRaw(opts.walletName, caip2, message.raw, opts.credential, opts.vaultPath)
        return result.signature as `0x${string}`
      }
      const result = signMessage(opts.walletName, caip2, message.raw, opts.credential, opts.vaultPath)
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
