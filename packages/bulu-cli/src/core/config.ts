import { AsyncLocalStorage } from 'node:async_hooks'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { defu } from 'defu'
import { createContext } from 'unctx'
import type { ObjectKeyPaths } from '#/utils/types'

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

export type ConfigPath = ObjectKeyPaths<BuluConfig>

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

export interface ConfigContext {
  config: BuluConfig
  set: (key: ConfigPath | (string & {}), value: any) => void
  get: (key: ConfigPath | (string & {})) => any
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

export function createConfigContext(cwd = getConfigDir()): ConfigContext {
  const configPath = getConfigPath(cwd)
  const userConfig = existsSync(configPath) ? (JSON.parse(readFileSync(configPath, 'utf8')) as BuluConfig) : {}
  const config = defu(userConfig, CONFIG_DEFAULTS) as BuluConfig
  const persistConfig = (): void => {
    ensureConfigDir(cwd)
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)
  }

  return {
    config,
    set(key, value) {
      const segments = key.split('.')
      let current = config as Record<string, unknown>

      for (const segment of segments.slice(0, -1)) {
        const next = current[segment]
        if (next == null || typeof next !== 'object' || Array.isArray(next)) {
          current[segment] = {}
        }
        current = current[segment] as Record<string, unknown>
      }

      current[segments.at(-1)!] = value
      persistConfig()
    },
    get(key) {
      let current: unknown = config

      for (const segment of key.split('.')) {
        if (current == null || typeof current !== 'object' || Array.isArray(current)) {
          return undefined
        }
        current = (current as Record<string, unknown>)[segment]
      }

      return current
    },
  }
}
