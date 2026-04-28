import { AsyncLocalStorage } from 'node:async_hooks'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { defu } from 'defu'
import { createContext } from 'unctx'
import type { ObjectKeyPaths, ObjectPathValue } from '#/utils/types'

const BULU_CONFIG_DIR_ENV = 'BULU_CONFIG_DIR'
const BULU_CONFIG_DEFAULT_DIR = 'bulu'
const BULU_CONFIG_FILENAME = 'bulu.config.json'

export interface BuluConfigChain {
  rpc?: string
  name?: string
  nativeCurrency?: {
    decimals: number
    name: string
    symbol: string
  }
}

export interface BuluConfig {
  default?: {
    chain?: string
    wallet?: string
    format?: 'table' | 'csv' | 'json'
  }
  chains?: Record<string, BuluConfigChain>
  hyperliquid?: {
    apiBase?: string
    retry?: number
    retryDelay?: number
    timeout?: number
  }
}

export type ConfigPath = ObjectKeyPaths<BuluConfig>

export const CONFIG_DEFAULTS: BuluConfig = {
  default: {
    chain: 'ethereum',
    wallet: 'main',
    format: 'table',
  },
  chains: {
    'eip155:1': {
      rpc: 'https://1rpc.io/eth',
    },
    'eip155:11155111': {
      rpc: 'https://1rpc.io/sepolia',
    },
  },
}

export interface ConfigContext {
  config: BuluConfig
  set<K extends ConfigPath>(key: K, value: ObjectPathValue<BuluConfig, K>): void
  set<K extends string>(key: K extends ConfigPath ? never : K, value: any): void
  get<K extends ConfigPath>(key: K): ObjectPathValue<BuluConfig, K>
  get<K extends string>(key: K extends ConfigPath ? never : K): any
}

export const configCtx = createContext<ConfigContext>({
  asyncContext: true,
  AsyncLocalStorage,
})

export function useConfig() {
  return configCtx.use()
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

function setPathValue(target: Record<string, unknown>, key: string, value: unknown): void {
  const segments = key.split('.')
  let current = target

  for (const segment of segments.slice(0, -1)) {
    const next = current[segment]
    if (next == null || typeof next !== 'object' || Array.isArray(next)) {
      current[segment] = {}
    }
    current = current[segment] as Record<string, unknown>
  }

  current[segments.at(-1)!] = value
}

export function createConfigContext(cwd = getConfigDir()): ConfigContext {
  const configPath = getConfigPath(cwd)
  const userConfig = existsSync(configPath) ? (JSON.parse(readFileSync(configPath, 'utf8')) as BuluConfig) : {}
  const config = {} as BuluConfig
  const refreshConfig = (): void => {
    Object.keys(config).forEach((key) => {
      delete config[key as keyof BuluConfig]
    })
    Object.assign(config, defu(structuredClone(userConfig), CONFIG_DEFAULTS) as BuluConfig)
  }
  const persistConfig = (): void => {
    ensureConfigDir(cwd)
    writeFileSync(configPath, `${JSON.stringify(userConfig, null, 2)}\n`)
  }

  refreshConfig()

  function set<K extends ConfigPath>(key: K, value: ObjectPathValue<BuluConfig, K>): void
  function set<K extends string>(key: K extends ConfigPath ? never : K, value: any): void
  function set(key: string, value: any): void {
    setPathValue(userConfig as Record<string, unknown>, key, value)
    refreshConfig()
    persistConfig()
  }

  function get<K extends ConfigPath>(key: K): ObjectPathValue<BuluConfig, K>
  function get<K extends string>(key: K extends ConfigPath ? never : K): any
  function get(key: string): any {
    let current: unknown = config

    for (const segment of key.split('.')) {
      if (current == null || typeof current !== 'object' || Array.isArray(current)) {
        return undefined
      }
      current = (current as Record<string, unknown>)[segment]
    }

    return current
  }

  return {
    config,
    set,
    get,
  }
}
