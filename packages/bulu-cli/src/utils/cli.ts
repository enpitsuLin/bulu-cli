import type { Output } from '../core/output'

/**
 * Execute a synchronous function and exit on error.
 * Eliminates repetitive try/catch + process.exit(1) blocks.
 */
export function executeOrExit<T>(out: Output, fn: () => T, errorPrefix: string): T {
  try {
    return fn()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    out.warn(`${errorPrefix}: ${message}`)
    process.exit(1)
  }
}

/**
 * Await a promise and exit on rejection.
 * Eliminates repetitive try/catch around fetch calls.
 */
export async function loadDataOrExit<T>(out: Output, promise: Promise<T>, errorMessage: string): Promise<T> {
  try {
    return await promise
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    out.warn(`${errorMessage}: ${message}`)
    process.exit(1)
  }
}

/**
 * Print a warning message and exit with code 1.
 * Used as a terminal error handler in command catch blocks.
 */
export function handleCommandError(out: Output, message: string): never {
  out.warn(message)
  process.exit(1)
}
