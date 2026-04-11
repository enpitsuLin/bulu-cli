import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const BULU_CONFIG_DIR_ENV = 'BULU_CONFIG_DIR'
const BULU_CONFIG_DEFAULT_DIR = 'bulu'
const BULU_CONFIG_FILENAME = 'bulu.config.json'

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

function loadUserConfigSync(cwd = getConfigDir()): Record<string, unknown> {
  const configPath = getConfigPath(cwd)
  if (!existsSync(configPath)) {
    return {}
  }

  try {
    return JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Invalid config file at ${configPath}: ${message}`)
  }
}

export function loadBuluConfigSync(cwd?: string): BuluConfig {
  const overrides = loadUserConfigSync(cwd || getConfigDir())
  return mergeConfig(CONFIG_DEFAULTS as Record<string, unknown>, overrides)
}

export async function loadBuluConfig(cwd?: string): Promise<BuluConfig> {
  return loadBuluConfigSync(cwd)
}

export function setDefaultWalletIfMissing(
  walletName: string,
  options?: {
    cwd?: string
    shouldReplace?: (currentWallet: string) => boolean
  },
): void {
  const cwd = options?.cwd ?? getConfigDir()
  let config: Record<string, unknown>
  try {
    config = loadUserConfigSync(cwd)
  } catch {
    return
  }

  const defaultConfig = config.default
  let configuredWallet: string | undefined
  if (
    typeof defaultConfig === 'object' &&
    defaultConfig !== null &&
    !Array.isArray(defaultConfig) &&
    typeof (defaultConfig as Record<string, unknown>).wallet === 'string'
  ) {
    configuredWallet = (defaultConfig as Record<string, unknown>).wallet as string
  }

  if (configuredWallet) {
    if (!options?.shouldReplace?.(configuredWallet)) {
      return
    }
  }

  ensureConfigDir(cwd)
  const nextDefault =
    typeof defaultConfig === 'object' && defaultConfig !== null && !Array.isArray(defaultConfig)
      ? { ...(defaultConfig as Record<string, unknown>) }
      : {}
  nextDefault.wallet = walletName
  config.default = nextDefault

  writeFileSync(getConfigPath(cwd), JSON.stringify(config, null, 2))
}

export function clearDefaultWalletIfMatches(walletName: string, cwd = getConfigDir()): void {
  let config: Record<string, unknown>
  try {
    config = loadUserConfigSync(cwd)
  } catch {
    return
  }

  const defaultConfig = config.default
  if (typeof defaultConfig !== 'object' || defaultConfig === null || Array.isArray(defaultConfig)) {
    return
  }

  const defaultWallet = (defaultConfig as Record<string, unknown>).wallet
  if (defaultWallet !== walletName) {
    return
  }

  const nextDefault = { ...(defaultConfig as Record<string, unknown>) }
  delete nextDefault.wallet

  if (Object.keys(nextDefault).length === 0) {
    delete config.default
  } else {
    config.default = nextDefault
  }

  ensureConfigDir(cwd)
  writeFileSync(getConfigPath(cwd), JSON.stringify(config, null, 2))
}
