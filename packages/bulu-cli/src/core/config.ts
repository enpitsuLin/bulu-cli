import { AsyncLocalStorage } from 'node:async_hooks'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createContext } from 'unctx'
import { defu } from 'defu'

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
    'eip155:1': { rpc: 'https://1rpc.io/eth' },
    'eip155:11155111': { rpc: 'https://1rpc.io/sepolia' },
  },
}

export interface ConfigOptions {
  config: BuluConfig
}

export const configCtx = createContext<ConfigOptions>({
  asyncContext: true,
  AsyncLocalStorage,
})

export function useConfig() {
  return configCtx.use().config
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
  return defu(CONFIG_DEFAULTS as Record<string, unknown>, overrides)
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

export function setConfigValue(keyPath: string, value: unknown): void {
  const runtimeConfig = useConfig()
  if (runtimeConfig) {
    setConfigValueByPath(runtimeConfig as UserConfig, keyPath, value)
    return
  }

  const userConfig = loadUserConfigSync()
  setConfigValueByPath(userConfig, keyPath, value)
  saveUserConfigSync(userConfig)
}

function getValueAtPath(source: unknown, path: readonly string[]): unknown {
  let current = source

  for (const segment of path) {
    if (!isRecord(current)) {
      return undefined
    }

    current = current[segment]
  }

  return current
}

function unwrapValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => unwrapValue(item))
  }

  if (!isRecord(value)) {
    return value
  }

  const result: Record<string, unknown> = {}

  for (const [key, nestedValue] of Object.entries(value)) {
    result[key] = unwrapValue(nestedValue)
  }

  return result
}

function setValueAtPath(target: UserConfig, path: readonly string[], value: unknown): void {
  let current = target

  for (const segment of path.slice(0, -1)) {
    const next = current[segment]

    if (!isRecord(next)) {
      current[segment] = {}
    }

    current = current[segment] as UserConfig
  }

  current[path[path.length - 1]] = unwrapValue(value)
}

function deleteValueAtPath(target: UserConfig, path: readonly string[]): boolean {
  const parents: Array<[Record<string, unknown>, string]> = []
  let current: Record<string, unknown> = target

  for (const segment of path.slice(0, -1)) {
    const next = current[segment]
    if (!isRecord(next)) {
      return false
    }

    parents.push([current, segment])
    current = next
  }

  const leafKey = path[path.length - 1]
  if (!(leafKey in current)) {
    return false
  }

  delete current[leafKey]

  for (let index = parents.length - 1; index >= 0; index -= 1) {
    const [parent, key] = parents[index]
    const child = parent[key]

    if (!isRecord(child) || Object.keys(child).length > 0) {
      break
    }

    delete parent[key]
  }

  return true
}

export function createRuntimeConfig(): BuluConfig {
  let config = loadBuluConfigSync() as Record<string, unknown>
  let userConfig = loadUserConfigSync()
  const proxyCache = new Map<string, Record<string, unknown>>()

  const reload = () => {
    config = loadBuluConfigSync() as Record<string, unknown>
    userConfig = loadUserConfigSync()
  }

  const getRecordAtPath = (path: readonly string[]) => {
    const value = getValueAtPath(config, path)
    return isRecord(value) ? value : {}
  }

  const createProxy = (path: readonly string[]): Record<string, unknown> => {
    const cacheKey = path.join('\0')
    const cachedProxy = proxyCache.get(cacheKey)
    if (cachedProxy) {
      return cachedProxy
    }

    const proxy = new Proxy<Record<string, unknown>>(
      {},
      {
        get(_, property) {
          if (typeof property !== 'string') {
            return undefined
          }

          if (property === 'toJSON') {
            return () => getValueAtPath(config, path)
          }

          const value = getValueAtPath(config, [...path, property])
          return isRecord(value) ? createProxy([...path, property]) : value
        },
        set(_, property, value) {
          if (typeof property !== 'string') {
            return false
          }

          setValueAtPath(userConfig, [...path, property], value)
          saveUserConfigSync(userConfig)
          reload()
          return true
        },
        deleteProperty(_, property) {
          if (typeof property !== 'string') {
            return false
          }

          if (!deleteValueAtPath(userConfig, [...path, property])) {
            return true
          }

          saveUserConfigSync(userConfig)
          reload()
          return true
        },
        has(_, property) {
          return typeof property === 'string' && property in getRecordAtPath(path)
        },
        ownKeys() {
          return Reflect.ownKeys(getRecordAtPath(path))
        },
        getOwnPropertyDescriptor(_, property) {
          if (typeof property !== 'string') {
            return undefined
          }

          const value = getValueAtPath(config, [...path, property])
          if (value === undefined) {
            return undefined
          }

          return {
            configurable: true,
            enumerable: true,
            writable: true,
            value: isRecord(value) ? createProxy([...path, property]) : value,
          }
        },
      },
    )

    proxyCache.set(cacheKey, proxy)
    return proxy
  }

  return createProxy([]) as BuluConfig
}
