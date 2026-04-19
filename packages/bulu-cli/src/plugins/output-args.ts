import { defineCittyPlugin, type ParsedArgs } from 'citty'
import { outputCtx, type OutputArgs, type OutputOptions } from '../core/output'

export default defineCittyPlugin({
  name: 'output-args',
  setup({ args }) {
    const { json, format } = args as ParsedArgs<OutputArgs>
    outputCtx.set({ json, format: format as OutputOptions['format'] })
  },
  cleanup() {},
})
