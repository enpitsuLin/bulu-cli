import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createDoctorReport } from './doctor'

const tempDirs: string[] = []

function createTempConfigDir(): string {
  const cwd = mkdtempSync(join(tmpdir(), 'bulu-doctor-'))
  tempDirs.push(cwd)
  return cwd
}

afterEach(() => {
  for (const cwd of tempDirs.splice(0)) {
    rmSync(cwd, { force: true, recursive: true })
  }
})

describe('createDoctorReport', () => {
  it('reports a missing config file and vault as warnings', () => {
    const configDir = createTempConfigDir()
    const report = createDoctorReport({ configDir })

    expect(report.ok).toBe(true)
    expect(report.summary.errors).toBe(0)
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ check: 'Config file', status: 'warning' }),
        expect.objectContaining({ check: 'Vault directory', status: 'warning' }),
      ]),
    )
  })

  it('reports invalid config and vault record JSON as errors', () => {
    const configDir = createTempConfigDir()
    const vaultDir = join(configDir, 'vault')
    const walletsDir = join(vaultDir, 'wallets')
    mkdirSync(walletsDir, { recursive: true })
    mkdirSync(join(vaultDir, 'policies'), { recursive: true })
    mkdirSync(join(vaultDir, 'keys'), { recursive: true })
    writeFileSync(join(configDir, 'bulu.config.json'), '{')
    writeFileSync(join(walletsDir, 'broken.json'), '{')

    const report = createDoctorReport({ configDir })

    expect(report.ok).toBe(false)
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ check: 'Config file JSON', status: 'error' }),
        expect.objectContaining({ check: 'Wallet records', status: 'error' }),
      ]),
    )
  })

  it('warns about loose unix permissions', () => {
    if (process.platform === 'win32') {
      return
    }

    const configDir = createTempConfigDir()
    const configPath = join(configDir, 'bulu.config.json')
    writeFileSync(configPath, '{}')
    chmodSync(configPath, 0o644)

    const report = createDoctorReport({ configDir })

    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          check: 'Config file permissions',
          status: 'warning',
          detail: expect.stringContaining('0644'),
        }),
      ]),
    )
  })
})
