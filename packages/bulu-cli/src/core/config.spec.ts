import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { CONFIG_DEFAULTS, createConfigContext, getConfigPath } from './config'

const tempDirs: string[] = []

function createTempConfigDir(): string {
  const cwd = mkdtempSync(join(tmpdir(), 'bulu-config-'))
  tempDirs.push(cwd)
  return cwd
}

afterEach(() => {
  for (const cwd of tempDirs.splice(0)) {
    rmSync(cwd, { force: true, recursive: true })
  }
})

describe('createConfigContext', () => {
  it('keeps defaults in memory and persists only user config', () => {
    const cwd = createTempConfigDir()
    const config = createConfigContext(cwd)

    expect(config.config).toEqual(CONFIG_DEFAULTS)

    config.set('default.wallet', 'alice')

    const savedConfig = JSON.parse(readFileSync(getConfigPath(cwd), 'utf8'))
    expect(savedConfig).toEqual({
      default: {
        wallet: 'alice',
      },
    })

    const reloadedConfig = createConfigContext(cwd)
    expect(reloadedConfig.config.default?.wallet).toBe('alice')
    expect(reloadedConfig.config.default?.chain).toBe(CONFIG_DEFAULTS.default?.chain)
    expect(reloadedConfig.config.default?.format).toBe(CONFIG_DEFAULTS.default?.format)
    expect(reloadedConfig.config.chains).toEqual(CONFIG_DEFAULTS.chains)
  })

  it('preserves explicit overrides without writing untouched defaults', () => {
    const cwd = createTempConfigDir()

    writeFileSync(
      getConfigPath(cwd),
      `${JSON.stringify(
        {
          default: {
            wallet: 'alice',
          },
        },
        null,
        2,
      )}\n`,
    )

    const config = createConfigContext(cwd)
    config.set('chains.eip155:1.rpc', 'https://example.invalid/rpc')

    const savedConfig = JSON.parse(readFileSync(getConfigPath(cwd), 'utf8'))
    expect(savedConfig).toEqual({
      default: {
        wallet: 'alice',
      },
      chains: {
        'eip155:1': {
          rpc: 'https://example.invalid/rpc',
        },
      },
    })

    expect(config.config.default?.chain).toBe(CONFIG_DEFAULTS.default?.chain)
    expect(config.config.chains?.['eip155:1']?.rpc).toBe('https://example.invalid/rpc')
    expect(config.config.chains?.['eip155:11155111']?.rpc).toBe(CONFIG_DEFAULTS.chains?.['eip155:11155111']?.rpc)
  })

  it('persists hyperliquid api base without introducing defaults', () => {
    const cwd = createTempConfigDir()
    const config = createConfigContext(cwd)

    config.set('hyperliquid.apiBase', 'https://api.hyperliquid-testnet.xyz')

    const savedConfig = JSON.parse(readFileSync(getConfigPath(cwd), 'utf8'))
    expect(savedConfig).toEqual({
      hyperliquid: {
        apiBase: 'https://api.hyperliquid-testnet.xyz',
      },
    })

    const reloadedConfig = createConfigContext(cwd)
    expect(reloadedConfig.get('hyperliquid.apiBase')).toBe('https://api.hyperliquid-testnet.xyz')
    expect(reloadedConfig.get('default.wallet')).toBe(CONFIG_DEFAULTS.default?.wallet)
  })

  it('persists hyperliquid retry, retryDelay, and timeout without introducing defaults', () => {
    const cwd = createTempConfigDir()
    const config = createConfigContext(cwd)

    config.set('hyperliquid.retry', 5)
    config.set('hyperliquid.retryDelay', 500)
    config.set('hyperliquid.timeout', 30000)

    const savedConfig = JSON.parse(readFileSync(getConfigPath(cwd), 'utf8'))
    expect(savedConfig).toEqual({
      hyperliquid: {
        retry: 5,
        retryDelay: 500,
        timeout: 30000,
      },
    })

    const reloadedConfig = createConfigContext(cwd)
    expect(reloadedConfig.get('hyperliquid.retry')).toBe(5)
    expect(reloadedConfig.get('hyperliquid.retryDelay')).toBe(500)
    expect(reloadedConfig.get('hyperliquid.timeout')).toBe(30000)
    expect(reloadedConfig.get('default.wallet')).toBe(CONFIG_DEFAULTS.default?.wallet)
  })
})
