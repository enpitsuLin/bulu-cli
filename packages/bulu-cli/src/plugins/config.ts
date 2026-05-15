import { configCtx, createConfigContext } from '#/core/config'
import { defineCittyPlugin } from 'citty'

export default defineCittyPlugin({
  name: 'config',
  setup({ rawArgs }) {
    configCtx.set(createConfigContext(undefined, { allowInvalidConfig: rawArgs.includes('doctor') }))
  },
  cleanup() {
    configCtx.unset()
  },
})
