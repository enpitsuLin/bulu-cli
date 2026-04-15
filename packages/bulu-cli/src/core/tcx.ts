import { isCancel, password } from '@clack/prompts'

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

  if (isCancel(result)) {
    process.exit(0)
  }

  return result
}
