import { password } from '@clack/prompts'

export async function resolveTCXPassphrase(): Promise<string> {
  const passphrase = process.env.TCX_PASSPHRASE || process.env.BULU_PASSPHRASE
  if (passphrase) {
    return passphrase
  }

  const apiKey = process.env.TCX_APIKEY || process.env.BULU_APIKEY
  if (apiKey) {
    return apiKey
  }

  const result = await password({
    message: 'Enter wallet passphrase:',
  })

  if (typeof result === 'symbol') {
    throw new Error('Passphrase input was cancelled')
  }

  return result
}
