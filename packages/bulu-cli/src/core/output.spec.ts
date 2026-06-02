import { afterEach, describe, expect, it, vi } from 'vitest'
import { outputCtx, useOutput } from './output'

afterEach(() => {
  vi.restoreAllMocks()
  try {
    outputCtx.unset()
  } catch {
    // Context may already be unset when a test fails before setup.
  }
})

describe('useOutput', () => {
  it('escapes CSV cells containing commas, quotes, or newlines', () => {
    const chunks: string[] = []
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      chunks.push(String(chunk))
      return true
    })

    outputCtx.set({ json: false, format: 'csv' })

    useOutput().table(
      [
        {
          name: 'plain',
          note: 'a,b',
          quote: 'x"y',
        },
        {
          name: 'two\nlines',
          note: '',
          quote: undefined,
        },
      ],
      { columns: ['name', 'note', 'quote'] },
    )

    expect(chunks.join('')).toBe('name,note,quote\nplain,"a,b","x""y"\n"two\nlines",,\n')
  })
})
