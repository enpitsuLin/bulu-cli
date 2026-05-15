import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { getConfigDir, getConfigPath, getVaultPath } from './config'

export type DoctorStatus = 'ok' | 'warning' | 'error'

export interface DoctorCheck {
  check: string
  status: DoctorStatus
  detail: string
  path?: string
}

export interface DoctorReport {
  ok: boolean
  configDir: string
  configPath: string
  vaultPath: string
  checks: DoctorCheck[]
  summary: {
    ok: number
    warnings: number
    errors: number
  }
}

export interface DoctorVaultReaders {
  listWallet(vaultPath: string): unknown[]
  listPolicy(vaultPath: string): unknown[]
  listApiKey(vaultPath: string): unknown[]
}

export interface CreateDoctorReportOptions {
  configDir?: string
  readers?: DoctorVaultReaders
}

interface MutableDoctorReport extends Omit<DoctorReport, 'ok' | 'summary'> {
  checks: DoctorCheck[]
}

const VAULT_RECORD_DIRS = [
  { check: 'Wallet records', dir: 'wallets' },
  { check: 'Policy records', dir: 'policies' },
  { check: 'API key records', dir: 'keys' },
]

export function createDoctorReport(options: CreateDoctorReportOptions = {}): DoctorReport {
  const configDir = options.configDir ?? getConfigDir()
  const configPath = getConfigPath(configDir)
  const vaultPath = getVaultPath(configDir)
  const report: MutableDoctorReport = {
    configDir,
    configPath,
    vaultPath,
    checks: [],
  }

  inspectConfig(report, configPath)
  inspectVault(report, vaultPath)

  if (options.readers) {
    inspectNativeVaultReaders(report, vaultPath, options.readers)
  }

  return finalizeReport(report)
}

function addCheck(report: MutableDoctorReport, check: DoctorCheck): void {
  report.checks.push(check)
}

function inspectConfig(report: MutableDoctorReport, configPath: string): void {
  const configDir = report.configDir
  inspectDirectory(report, 'Config directory', configDir)

  if (!existsSync(configPath)) {
    addCheck(report, {
      check: 'Config file',
      status: 'warning',
      detail: 'Config file does not exist; defaults will be used.',
      path: configPath,
    })
    return
  }

  inspectFilePermissions(report, 'Config file permissions', configPath)

  try {
    const parsed = JSON.parse(readFileSync(configPath, 'utf8'))
    if (!isPlainObject(parsed)) {
      addCheck(report, {
        check: 'Config file JSON',
        status: 'error',
        detail: 'Config file must contain a JSON object.',
        path: configPath,
      })
      return
    }

    addCheck(report, {
      check: 'Config file JSON',
      status: 'ok',
      detail: 'Config file is valid JSON.',
      path: configPath,
    })
  } catch (error) {
    addCheck(report, {
      check: 'Config file JSON',
      status: 'error',
      detail: `Config file cannot be parsed: ${formatError(error)}`,
      path: configPath,
    })
  }
}

function inspectVault(report: MutableDoctorReport, vaultPath: string): void {
  if (!existsSync(vaultPath)) {
    addCheck(report, {
      check: 'Vault directory',
      status: 'warning',
      detail: 'Vault directory does not exist yet.',
      path: vaultPath,
    })
    return
  }

  inspectDirectory(report, 'Vault directory', vaultPath)

  for (const item of VAULT_RECORD_DIRS) {
    inspectRecordDirectory(report, item.check, join(vaultPath, item.dir))
  }
}

function inspectDirectory(report: MutableDoctorReport, check: string, path: string): void {
  if (!existsSync(path)) {
    addCheck(report, {
      check,
      status: 'warning',
      detail: 'Directory does not exist yet.',
      path,
    })
    return
  }

  const stat = statSync(path)
  if (!stat.isDirectory()) {
    addCheck(report, {
      check,
      status: 'error',
      detail: 'Path exists but is not a directory.',
      path,
    })
    return
  }

  const permissionWarning = getPermissionWarning(stat.mode, 0o700)
  addCheck(report, {
    check,
    status: permissionWarning ? 'warning' : 'ok',
    detail: permissionWarning ?? 'Directory exists with recommended permissions.',
    path,
  })
}

function inspectRecordDirectory(report: MutableDoctorReport, check: string, dir: string): void {
  if (!existsSync(dir)) {
    addCheck(report, {
      check,
      status: 'warning',
      detail: 'Record directory does not exist yet.',
      path: dir,
    })
    return
  }

  inspectDirectory(report, `${check} directory`, dir)

  const entries = readdirSync(dir, { withFileTypes: true })
  const jsonFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
  const tempFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.tmp'))
  let invalidRecords = 0
  let looseFiles = 0

  for (const file of jsonFiles) {
    const path = join(dir, file.name)
    try {
      JSON.parse(readFileSync(path, 'utf8'))
    } catch {
      invalidRecords += 1
    }

    const stat = statSync(path)
    if (getPermissionWarning(stat.mode, 0o600)) {
      looseFiles += 1
    }
  }

  if (invalidRecords > 0) {
    addCheck(report, {
      check,
      status: 'error',
      detail: `${invalidRecords} of ${jsonFiles.length} JSON record(s) cannot be parsed.`,
      path: dir,
    })
  } else {
    addCheck(report, {
      check,
      status: 'ok',
      detail: `${jsonFiles.length} JSON record(s) parsed successfully.`,
      path: dir,
    })
  }

  if (looseFiles > 0) {
    addCheck(report, {
      check: `${check} file permissions`,
      status: 'warning',
      detail: `${looseFiles} record file(s) are more open than 0600.`,
      path: dir,
    })
  }

  if (tempFiles.length > 0) {
    addCheck(report, {
      check: `${check} temporary files`,
      status: 'warning',
      detail: `${tempFiles.length} leftover temporary file(s) found.`,
      path: dir,
    })
  }
}

function inspectFilePermissions(report: MutableDoctorReport, check: string, path: string): void {
  const stat = statSync(path)
  const warning = getPermissionWarning(stat.mode, 0o600)
  addCheck(report, {
    check,
    status: warning ? 'warning' : 'ok',
    detail: warning ?? 'File exists with recommended permissions.',
    path,
  })
}

function inspectNativeVaultReaders(report: MutableDoctorReport, vaultPath: string, readers: DoctorVaultReaders): void {
  addNativeCountCheck(report, 'Native wallet loader', vaultPath, readers.listWallet)
  addNativeCountCheck(report, 'Native policy loader', vaultPath, readers.listPolicy)
  addNativeCountCheck(report, 'Native API key loader', vaultPath, readers.listApiKey)
}

function addNativeCountCheck(
  report: MutableDoctorReport,
  check: string,
  vaultPath: string,
  read: (vaultPath: string) => unknown[],
): void {
  try {
    const records = read(vaultPath)
    addCheck(report, {
      check,
      status: 'ok',
      detail: `Loaded ${records.length} record(s).`,
      path: vaultPath,
    })
  } catch (error) {
    addCheck(report, {
      check,
      status: 'error',
      detail: formatError(error),
      path: vaultPath,
    })
  }
}

function finalizeReport(report: MutableDoctorReport): DoctorReport {
  const summary = {
    ok: report.checks.filter((check) => check.status === 'ok').length,
    warnings: report.checks.filter((check) => check.status === 'warning').length,
    errors: report.checks.filter((check) => check.status === 'error').length,
  }

  return {
    ...report,
    ok: summary.errors === 0,
    summary,
  }
}

function getPermissionWarning(mode: number, expected: number): string | undefined {
  if (process.platform === 'win32') {
    return undefined
  }

  const actual = mode & 0o777
  if ((actual & 0o077) === 0) {
    return undefined
  }

  return `Permissions are ${formatMode(actual)}, which is more open than recommended (${formatMode(expected)}).`
}

function formatMode(mode: number): string {
  return `0${mode.toString(8)}`
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
