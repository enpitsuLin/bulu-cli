import type { Output } from '../../core/output'

export class HyperliquidCliError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HyperliquidCliError'
  }
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function fail(message: string): never {
  throw new HyperliquidCliError(message)
}

export function wrapSync<T>(fn: () => T, prefix: string): T {
  try {
    return fn()
  } catch (error) {
    fail(`${prefix}: ${getErrorMessage(error)}`)
  }
}

export async function wrapAsync<T>(promise: Promise<T>, prefix: string): Promise<T> {
  try {
    return await promise
  } catch (error) {
    fail(`${prefix}: ${getErrorMessage(error)}`)
  }
}

export function exitWithCommandError(out: Output, error: unknown): never {
  out.warn(getErrorMessage(error))
  process.exit(1)
}

export async function runHyperliquidCommand(out: Output, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
  } catch (error) {
    exitWithCommandError(out, error)
  }
}
