import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { runConfigGet } from '../src/commands/config/get'
import { runConfigInit } from '../src/commands/config/init'
import { runConfigList } from '../src/commands/config/list'
import { runConfigSet } from '../src/commands/config/set'
import { CONFIG_DEFAULTS } from '../src/core/config'

function captureStdout() {
  let output = ''
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
    output += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8')
    return true
  }) as typeof process.stdout.write)

  return {
    read: () => output,
    restore: () => spy.mockRestore(),
  }
}

describe('config commands', () => {
  let configDir = ''

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'bulu-cli-config-test-'))
    process.env.BULU_CONFIG_DIR = configDir
  })

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true })
    delete process.env.BULU_CONFIG_DIR
    vi.restoreAllMocks()
  })

  test('config init creates the default config file', async () => {
    const stdout = captureStdout()
    await runConfigInit({ json: true })
    stdout.restore()

    expect(JSON.parse(readFileSync(join(configDir, 'bulu.config.json'), 'utf-8'))).toEqual(CONFIG_DEFAULTS)
    expect(JSON.parse(stdout.read())).toMatchObject({
      status: 'success',
      action: 'created',
      path: join(configDir, 'bulu.config.json'),
      config: CONFIG_DEFAULTS,
    })
  })

  test('config get resolves merged default values', async () => {
    const stdout = captureStdout()
    await runConfigGet({
      key: 'default.chain',
      json: true,
    })
    stdout.restore()

    expect(JSON.parse(stdout.read())).toBe('ethereum')
  })

  test('config set writes parsed values to the user config file', async () => {
    const stdout = captureStdout()
    await runConfigSet({
      key: 'features.debug',
      value: 'true',
      json: true,
    })
    stdout.restore()

    expect(JSON.parse(readFileSync(join(configDir, 'bulu.config.json'), 'utf-8'))).toMatchObject({
      features: {
        debug: true,
      },
    })
    expect(JSON.parse(stdout.read())).toMatchObject({
      status: 'success',
      key: 'features.debug',
      value: true,
      path: join(configDir, 'bulu.config.json'),
    })
  })

  test('config list supports csv output for flattened config values', async () => {
    const stdout = captureStdout()
    await runConfigList({
      format: 'csv',
    })
    stdout.restore()

    expect(stdout.read()).toContain('Key,Value')
    expect(stdout.read()).toContain('default.chain,ethereum')
    expect(stdout.read()).toContain('chains.ethereum.rpc,https://1rpc.io/eth')
  })
})
