import { importWalletPrivateKey } from '@bulu-cli/tcx-core'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { configCtx, createConfigContext } from '#/core/config'
import { HyperliquidRequestError, createHyperliquidClient, signHyperliquidL1Action } from './client'

const PRIVATE_KEY = 'a392604efc2fad9c0b3da43b5f698a2e3f270f170d859912be0d54742275c5f6'
const PASSWORD = 'imToken'

function withConfig<T>(fn: () => T): T {
  const config = createConfigContext()
  return configCtx.call(config, fn)
}

describe('Hyperliquid client helpers', () => {
  it('captures hyperliquid request metadata on custom errors', () => {
    const cause = new Error('socket hang up')
    const error = new HyperliquidRequestError({
      message: 'backend exploded',
      status: 500,
      data: { ok: false },
      cause,
    })

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('HyperliquidRequestError')
    expect(error.message).toBe('Hyperliquid request failed: backend exploded')
    expect(error.status).toBe(500)
    expect(error.data).toEqual({ ok: false })
    expect(error.cause).toBe(cause)
  })

  it('creates client with testnet option', () => {
    const client = withConfig(() => createHyperliquidClient({ testnet: true }))
    expect(client.isTestnet).toBe(true)
    expect(client.apiBase).toBe('https://api.hyperliquid-testnet.xyz')
  })

  it('creates client with custom retry, retryDelay, and timeout options', () => {
    const client = withConfig(() =>
      createHyperliquidClient({ testnet: false, retry: 5, retryDelay: 500, timeout: 30000 }),
    )
    expect(client.isTestnet).toBe(false)
    expect(client.apiBase).toBe('https://api.hyperliquid.xyz')
  })

  it('signs l1 actions with Hyperliquid typed data envelope', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'bulu-hyperliquid-sign-'))

    try {
      importWalletPrivateKey('Signer', PRIVATE_KEY, PASSWORD, tempDir)

      const signature = signHyperliquidL1Action({
        walletName: 'Signer',
        credential: PASSWORD,
        vaultPath: tempDir,
        nonce: 1710000000000,
        isTestnet: false,
        action: {
          type: 'order',
          orders: [
            {
              a: 10000,
              b: true,
              p: '0.25',
              s: '10',
              r: false,
              t: { limit: { tif: 'Gtc' } },
            },
          ],
          grouping: 'na',
        },
      })

      expect(signature).toEqual({
        r: '0x9aa0ad2a1f1a83d79115fedfac773b083c9d47208884bd4668aa940881fdd665',
        s: '0x11d73c26835d4fb2f02e20f15799d91e325451382e8facfac9210c8cc670335f',
        v: 27,
      })
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
