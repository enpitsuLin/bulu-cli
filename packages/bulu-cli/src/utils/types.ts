type Digit = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

type NextDigit = [1, 2, 3, 4, 5, 6, 7, 'STOP']

type Inc<T> = T extends Digit ? NextDigit[T] : 'STOP'

type StringOrNumKeys<TObj> = TObj extends unknown[] ? 0 : keyof TObj & string

type NestedPath<TValue, Prefix extends string, TValueNestedChild, TDepth> = TValue extends object
  ? `${Prefix}.${TDepth extends 'STOP' ? string : NestedFieldPaths<TValue, TValueNestedChild, TDepth>}`
  : never

type GetValue<T, K extends string | number> = T extends unknown[]
  ? K extends number
    ? T[K]
    : never
  : K extends keyof T
    ? T[K]
    : never

type Nullish = null | undefined

type PathSegmentValue<T, TKey extends string> = TKey extends keyof NonNullable<T>
  ? NonNullable<T>[TKey]
  : NonNullable<T> extends Record<string, infer TValue>
    ? TValue
    : never

type NestedFieldPaths<TData = any, TValue = any, TDepth = 0> = {
  [TKey in StringOrNumKeys<TData>]:
    | (GetValue<TData, TKey> extends TValue ? `${TKey}` : never)
    | NestedPath<GetValue<TData, TKey>, `${TKey}`, TValue, Inc<TDepth>>
}[StringOrNumKeys<TData>]

export type ObjectKeyPaths<TData = any> = TData extends any ? NestedFieldPaths<TData, any, 1> : never

export type ObjectPathValue<TData, TPath extends string> = TPath extends `${infer THead}.${infer TTail}`
  ? ObjectPathValue<PathSegmentValue<TData, THead>, TTail> | Extract<TData, Nullish>
  : PathSegmentValue<TData, TPath> | Extract<TData, Nullish>
