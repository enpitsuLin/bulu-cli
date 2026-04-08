import { password } from '@clack/prompts'

export async function resolveTCXPassphrase(): Promise<string> {
  if (process.env.TCX_PASSPHRASE) {
    return process.env.TCX_PASSPHRASE
  }

  const result = await password({
    message: 'Enter wallet passphrase:',
  })

  if (typeof result === 'symbol') {
    throw new Error('Passphrase input was cancelled')
  }

  return result
}
