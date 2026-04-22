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
})
