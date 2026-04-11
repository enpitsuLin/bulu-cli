import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const BULU_CONFIG_DIR_ENV = 'BULU_CONFIG_DIR'
const BULU_CONFIG_DEFAULT_DIR = 'bulu'
const BULU_CONFIG_FILENAME = 'bulu.config.json'

export type UserConfig = Record<string, unknown>

export interface BuluConfig {
  default?: {
    chain?: string
    wallet?: string
    format?: 'table' | 'csv' | 'json'
  }
  chains?: Record<string, { rpc?: string }>
}

export const CONFIG_DEFAULTS: BuluConfig = {
  default: {
    chain: 'ethereum',
    wallet: 'main',
    format: 'table',
  },
  chains: {
    ethereum: { rpc: 'https://1rpc.io/eth' },
    arbitrum: { rpc: 'https://arb1.arbitrum.io/rpc' },
    optimism: { rpc: 'https://mainnet.optimism.io' },
    polygon: { rpc: 'https://polygon-bor-rpc.publicnode.com' },
    base: { rpc: 'https://mainnet.base.org' },
  },
}

export interface InitBuluConfigResult {
  action: 'created' | 'overwritten' | 'unchanged'
  config: BuluConfig
  path: string
}

export function getConfigDir(): string {
  return process.env[BULU_CONFIG_DIR_ENV] || join(homedir(), '.config', BULU_CONFIG_DEFAULT_DIR)
}

export function getConfigPath(cwd = getConfigDir()): string {
  return join(cwd, BULU_CONFIG_FILENAME)
}

export function getVaultPath(cwd = getConfigDir()): string {
  return join(cwd, 'vault')
}

export function ensureConfigDir(cwd = getConfigDir()): void {
  if (!existsSync(cwd)) {
    mkdirSync(cwd, { recursive: true })
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cloneConfig<T>(value: T): T {
  return structuredClone(value)
}

function mergeConfig<T extends Record<string, unknown>>(defaults: T, overrides: Record<string, unknown>): T {
  const result: Record<string, unknown> = { ...defaults }

  for (const [key, value] of Object.entries(overrides)) {
    const existing = result[key]
    if (isRecord(existing) && isRecord(value)) {
      result[key] = mergeConfig(existing, value)
    } else {
      result[key] = value
    }
  }

  return result as T
}

function parseConfigKeyPath(keyPath: string): string[] {
  const normalized = keyPath.trim()
  if (!normalized) {
    throw new Error('Config key is required')
  }

  const segments = normalized.split('.').map((segment) => segment.trim())
  if (segments.some((segment) => segment.length === 0)) {
    throw new Error(`Invalid config key "${keyPath}"`)
  }

  return segments
}

export function loadUserConfigSync(cwd = getConfigDir()): UserConfig {
  const configPath = getConfigPath(cwd)
  if (!existsSync(configPath)) {
    return {}
  }

  try {
    return JSON.parse(readFileSync(configPath, 'utf-8')) as UserConfig
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Invalid config file at ${configPath}: ${message}`)
  }
}

export function saveUserConfigSync(config: UserConfig, cwd = getConfigDir()): void {
  ensureConfigDir(cwd)
  writeFileSync(getConfigPath(cwd), JSON.stringify(config, null, 2))
}

export function initBuluConfigSync(options?: { cwd?: string; force?: boolean }): InitBuluConfigResult {
  const cwd = options?.cwd ?? getConfigDir()
  const configPath = getConfigPath(cwd)
  const existed = existsSync(configPath)

  if (existed && !options?.force) {
    return {
      action: 'unchanged',
      config: loadBuluConfigSync(cwd),
      path: configPath,
    }
  }

  const config = cloneConfig(CONFIG_DEFAULTS)
  saveUserConfigSync(config as UserConfig, cwd)

  return {
    action: existed ? 'overwritten' : 'created',
    config,
    path: configPath,
  }
}

export function loadBuluConfigSync(cwd?: string): BuluConfig {
  const overrides = loadUserConfigSync(cwd || getConfigDir())
  return mergeConfig(CONFIG_DEFAULTS as Record<string, unknown>, overrides)
}

export function getConfigValueByPath(config: unknown, keyPath: string): unknown {
  let current = config

  for (const segment of parseConfigKeyPath(keyPath)) {
    if (!isRecord(current)) {
      return undefined
    }
    current = current[segment]
  }

  return current
}

export function setConfigValueByPath(config: UserConfig, keyPath: string, value: unknown): void {
  const segments = parseConfigKeyPath(keyPath)
  let current = config

  for (const segment of segments.slice(0, -1)) {
    const next = current[segment]
    if (!isRecord(next)) {
      current[segment] = {}
    }
    current = current[segment] as UserConfig
  }

  current[segments[segments.length - 1]] = value
}
