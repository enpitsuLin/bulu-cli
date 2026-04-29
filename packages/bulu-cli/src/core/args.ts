import type { ArgsDef } from 'citty'

export function withArgs<T extends ArgsDef>(userArgs: T, ...argGroups: ArgsDef[]): T & ArgsDef {
  return Object.assign({}, ...argGroups, userArgs)
}
