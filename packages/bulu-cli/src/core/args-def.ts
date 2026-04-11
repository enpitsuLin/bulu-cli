import type { ArgsDef, Resolvable } from 'citty'

const commonArgs = {
  json: {
    type: 'boolean',
    description: 'Force JSON output',
    default: false,
  },
  format: {
    type: 'string',
    description: 'Output format: table, csv, json',
    default: 'table',
  },
} satisfies ArgsDef

export async function withDefaultArgs<T extends ArgsDef = ArgsDef>(
  args: Resolvable<T>,
): Promise<typeof commonArgs & T> {
  const resolveArgs = typeof args === 'function' ? args() : args

  return {
    ...(await resolveArgs),
    ...commonArgs,
  }
}
